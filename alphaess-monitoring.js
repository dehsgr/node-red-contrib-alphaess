// ~~~ constants ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

module.exports = function(RED)
{
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
		this.Cache = {
			'Daily' : {
				'LastQuery': 0,
				'Statistics': undefined
			}
		};

		Object.defineProperty(this.Cache, "Index", { get: function () { 
			return new Date().getDate() - 1;
		}});

		Object.defineProperty(this.Cache, "Date", { get: function () { 
			var now = new Date();
			return now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
		}});

		function monitor()
		{
			Platform.login();
			Platform.fetchRealtime();
		}

		monitor();

		Loop = setInterval(function() {
			monitor();
		}, Platform.Interval * 1000);   // trigger every defined secs

		Platform.on('close', function() {
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
			if(myError)
			{
				Platform.warn('There was an error during login operation into Alpha ESS monitoring portal: ' + myError);
			}
			else
			{
				var body = JSON.parse(myResponse.body);
				Platform.Auth = {
					'Token': body.data.AccessToken,
					'Expires': body.data.ExpiresIn + Date.now(),
					'RefreshKey': body.data.RefreshTokenKey
				};
			}
		});
	}

	AlphaESS.prototype.fetchRealtime = function()
	{
		var Platform = this;

		if (!Platform.Auth || !Platform.Auth.Token)
		{
			return;
		}
		
		Platform.log('Fetching realtime data...');

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
			if(myError)
			{
				Platform.warn('There was an error fetching realtime data for ' + Platform.Serial + ': ' + myError);
			}
			else
			{
				var body = JSON.parse(myResponse.body);
				var today = new Date();
				today = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();

				// let's fetch daily statistics every 5 minutes...
				if (Date.now() > Platform.Cache.Daily.LastQuery + (1000 * 60 * 5)) {
					Platform.fetchStatistics();
				}

				// don't send any data until caches have been populated...
				if (!Platform.Cache.Daily.LastQuery)
				{
					return;
				}

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
						'today': {
							'consumption':
								Platform.Cache.Daily.Statistics.Eloads[Platform.Cache.Index],
							'grid': {
								'supply': Platform.Cache.Daily.Statistics.Eoutputs[Platform.Cache.Index],
								'purchase': Platform.Cache.Daily.Statistics.Einputs[Platform.Cache.Index]
							},
							'modules':
								Platform.Cache.Daily.Statistics.Epvs[Platform.Cache.Index],
							'battery': {
								'charge': Platform.Cache.Daily.Statistics.ECharge[Platform.Cache.Index],
								'discharge': Platform.Cache.Daily.Statistics.EDischarge[Platform.Cache.Index]
							}
						},
						'rawdata': {
							'realtime': body.data,
							'today': Platform.Cache.Daily.Statistics
						}
					}
				});
			}
		});
	}

	AlphaESS.prototype.fetchStatistics = function()
	{
		var Platform = this;

		if (!Platform.Auth || !Platform.Auth.Token)
		{
			return;
		}

		Platform.log('Fetching statistics...');

		require('request')({
			method: 'POST',
			url: Platform.BaseURI + 'Statistic/SystemStatistic',
			headers: {
				'Content-Type': 'application/json',
				'Connection': 'keep-alive',
				'Accept': '*/*',
				'Accept-Encoding': 'gzip, deflate',
				'Cache-Control': 'no-cache',
				'Authorization': 'Bearer ' + Platform.Auth.Token
			},
			body: JSON.stringify({
				'statisticBy': 'month',
				'sDate': Platform.Cache.Date,
				'isOEM': 0,
				'sn': Platform.Serial,
				'userId': '',
			})
		}, function(myError, myResponse) {
			if(myError)
			{
				Platform.warn('There was an error fetching statistics for ' + Platform.Serial + ': ' + myError);
			}
			else
			{
				var body = JSON.parse(myResponse.body);
				Platform.Cache.Daily = {
					'LastQuery': Date.now(),
					'Statistics': body.data
				}
			}
		});
	}
};