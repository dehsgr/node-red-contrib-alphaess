// ~~~ constants ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

module.exports = function(RED) {
	'use strict';

	// ~~~ constructor / destructor ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

	function AlphaESS(myNode)
	{
		RED.nodes.createNode(this, myNode);

		var Platform = this;
		var Loop;
	
		this.Auth = undefined;
		this.Serial = myNode.serial;
		this.Username = myNode.username;
		this.Password = myNode.password;
		this.Interval = parseInt(myNode.interval);
		this.BaseURI = 'https://www.alphaess.com/api/';

		function monitor()
		{
			Platform.login();
			Platform.fetchData();
		}

		monitor();

		Loop = setInterval(function() {
			monitor();
		}, Platform.Interval * 1000);   // trigger every defined secs

		Platform.on("close", function() {
			if (Loop) {
				clearInterval(Loop);
			}
		});
	}

	RED.nodes.registerType('alphaess-monitoring', AlphaESS);

	// ~~~ functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

	AlphaESS.prototype.login = function()
	{
		var Platform = this;
		var LoginData = {
			'username': Platform.Username,
			'password': Platform.Password
		};

		if (Platform.Auth &&
			Platform.Auth.Token &&
			Platform.Auth.Expires &&
			Platform.Auth.RefreshKey)
		{
			if (Platform.Auth.Expires > Date.now())
			{
				return;
			}

			LoginData = {
				'userName': Platform.Username,
				'accessToken': Platform.Auth.Token,
				'refreshTokenKey': Platform.Auth.RefreshKey
			};
		} 

		Platform.log(
			LoginData.refreshTokenKey === undefined ?
			'Logging in...' :
			'Renewing token...'
		);

		require('request')({
			method: 'POST',
			url: Platform.BaseURI + (
				LoginData.refreshTokenKey === undefined ?
				'Account/Login' :
				'Account/RefreshToken'
			),
			headers: {
				'Content-Type': 'application/json',
				'Connection': 'keep-alive',
				'Accept': '*/*',
				'Accept-Encoding': 'gzip, deflate',
				'Cache-Control': 'no-cache'
			},
			body: JSON.stringify(LoginData)
		}, function(myError, myResponse) {
			if(myError) {
				Platform.warn('There was an error during login operation into Alpha ESS monitoring portal: ' + myError);
			} else {
				var body = JSON.parse(myResponse.body);
				Platform.Auth = {
					'Token': body.data.AccessToken,
					'Expires': body.data.ExpiresIn + Date.now(),
					'RefreshKey': body.data.RefreshTokenKey
				};
			}
		});
	}

	AlphaESS.prototype.fetchData = function() {
		var Platform = this;

		if (!Platform.Auth || !Platform.Auth.Token)
		{
			return;
		}
		
		Platform.log('Fetching monitoring data...');

		require('request')({
			method: 'GET',
			url: Platform.BaseURI + 'ESS/GetSecondDataBySn?sys_sn=' + Platform.Serial + '&noLoading=true',
			headers: {
				'Content-Type': 'application/json',
				'Connection': 'keep-alive',
				'Accept': '*/*',
				'Accept-Encoding': 'gzip, deflate',
				'Cache-Control': 'no-cache',
				'Authorization': 'Bearer ' + Platform.Auth.Token
			}
		}, function(myError, myResponse) {
			if(myError) {
				Platform.warn('There was an error fetching monitoring data for ' + Platform.Serial + ': ' + myError);
			} else {
				var body = JSON.parse(myResponse.body);
				Platform.send({ 
					'code': body.code,
					'info': body.info,
					'payload': {
						'consumption': 
							body.data.pmeter_l1 + body.data.pmeter_l2 + body.data.pmeter_l3 + 
							body.data.ppv1 + body.data.ppv2 + body.data.ppv3 + body.data.ppv4 +
							body.data.pbat,
						'grid':
							body.data.pmeter_l1 + body.data.pmeter_l2 + body.data.pmeter_l3,
						'modules':
							body.data.ppv1 + body.data.ppv2 + body.data.ppv3 + body.data.ppv4,
						'battery': {
							'soc': body.data.soc,
							'load': body.data.pbat
						},
						'rawdata': body.data
					}
				});
			}
		});
	}
};