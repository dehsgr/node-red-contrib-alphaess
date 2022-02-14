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
			'Hourly' : {
				'LastQuery': 0,
				'Statistics': undefined
			},
			'Daily' : {
				'LastQuery': 0,
				'Statistics': undefined
			},
			'Monthly' : {
				'LastQuery': 0,
				'Statistics': undefined
			},
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

	RED.nodes.registerType('alphaess-monitoring', AlphaESS, {
		credentials: {
			username: {type: "text"},
			password: {type: "password"},
			serial: {type: "text"}
		}
	});

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
				try
				{
					Platform.Auth = {
						'Token': body.data.AccessToken,
						'Expires': Date.now() + (
							(body.data.ExpiresIn - 3600) * 1000		// ExpiresIn are returned in secs!
						),
						'RefreshKey': body.data.RefreshTokenKey
					};
				}
				catch(myError)
				{
					Platform.warn('There was an error during login operation into Alpha ESS monitoring portal: ' + myError + '\r\n\r\nWe got the following unprocessable body:\r\n' + myResponse.body);
				}
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
		
		Platform.debug('Fetching realtime data...');

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
				if (body.data === null) {
					Platform.warn('There was an error fetching realtime data for ' + Platform.Serial + ': Empty response!');
					body.data = {
						pmeter_l1: 0, pmeter_l2: 0, pmeter_l3: 0,
						ppv1: 0, ppv2: 0, ppv3: 0, ppv4: 0,
						pbat: 0
					}
				}

				// let's fetch hourly statistics every 10 minutes...
				if (Date.now() > Platform.Cache.Daily.LastQuery + (1000 * 60 * 10)) {
					Platform.fetchHourlyStatistics();
				}

				// let's fetch daily statistics every 10 minutes...
				if (Date.now() > Platform.Cache.Daily.LastQuery + (1000 * 60 * 10)) {
					Platform.fetchDailyStatistics();
				}

				// let's fetch monthly statistics every hour...
				if (Date.now() > Platform.Cache.Daily.LastQuery + (1000 * 60 * 60)) {
					Platform.fetchMonthlyStatistics();
				}

				// don't send any data until caches have been populated...
				if (!Platform.Cache.Hourly.LastQuery || !Platform.Cache.Daily.LastQuery || !Platform.Cache.Monthly.LastQuery)
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
							'statistics': {
								'hourly': Platform.Cache.Hourly.Statistics,
								'daily': Platform.Cache.Daily.Statistics,
								'monthly': Platform.Cache.Monthly.Statistics
							}
						}
					}
				});
			}
		});
	}

	AlphaESS.prototype.fetchHourlyStatistics = function()
	{
		var Platform = this;

		if (!Platform.Auth || !Platform.Auth.Token)
		{
			return;
		}

		Platform.debug('Fetching hourly statistics...');

		require('request')({
			method: 'POST',
			url: Platform.BaseURI + 'Power/SticsByDay',
			headers: {
				'Content-Type': 'application/json',
				'Connection': 'keep-alive',
				'Accept': '*/*',
				'Accept-Encoding': 'gzip, deflate',
				'Cache-Control': 'no-cache',
				'Authorization': 'Bearer ' + Platform.Auth.Token
			},
			body: JSON.stringify({
				'szDay': Platform.Cache.Date,
				'sDate': Platform.Cache.Date,
				'isOEM': 0,
				'sn': Platform.Serial,
				'userId': Platform.Serial,
			})
		}, function(myError, myResponse) {
			if(myError)
			{
				Platform.warn('There was an error fetching hourly statistics for ' + Platform.Serial + ': ' + myError);
			}
			else
			{
				var body = JSON.parse(myResponse.body);
				Platform.Cache.Hourly = {
					'LastQuery': Date.now(),
					'Statistics': body.data
				}
			}
		});
	}

	AlphaESS.prototype.fetchDailyStatistics = function()
	{
		var Platform = this;

		if (!Platform.Auth || !Platform.Auth.Token)
		{
			return;
		}

		Platform.debug('Fetching daily statistics...');

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
				Platform.warn('There was an error fetching daily statistics for ' + Platform.Serial + ': ' + myError);
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

	AlphaESS.prototype.fetchMonthlyStatistics = function()
	{
		var Platform = this;

		if (!Platform.Auth || !Platform.Auth.Token)
		{
			return;
		}

		Platform.debug('Fetching monthly statistics...');

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
				'statisticBy': 'year',
				'sDate': Platform.Cache.Date,
				'isOEM': 0,
				'sn': Platform.Serial,
				'userId': '',
			})
		}, function(myError, myResponse) {
			if(myError)
			{
				Platform.warn('There was an error fetching monthly statistics for ' + Platform.Serial + ': ' + myError);
			}
			else
			{
				var body = JSON.parse(myResponse.body);
				Platform.Cache.Monthly = {
					'LastQuery': Date.now(),
					'Statistics': body.data
				}
			}
		});
	}
};