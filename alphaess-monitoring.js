module.exports = function(RED)
{
	'use strict';

	// ~~~ dependencies ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

	const API = require('./alphaess-open-api.js');

	// ~~~ fields ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

	let Platform = this;

	// ~~~ constructor / destructor ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

	function AlphaESS(myNode)
	{
		RED.nodes.createNode(this, myNode);

		Platform = this;

		var Loop;
	
		this.AppID = myNode.appid;
		this.AppSecret = myNode.appsecret;
		this.Serial = myNode.serial;
		this.Mode = parseInt(myNode.mode);
		this.Interval = parseInt(myNode.interval);
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

		this.on('input', async function (msg)
		{
			switch (msg.topic) {
				case 'POST':
					if (!msg.command || !msg.payload) 
					{
						Platform.error ('Invalid arguments given!');
					}

					var r = await API.SetData(msg.command, Platform.Serial, msg.payload, Platform.AppID, Platform.AppSecret, Platform);
					break;

				default:
					if (
						!msg.command ||
						(
							(
								msg.command === 'getOneDayPowerBySn' ||
								msg.command === 'getOneDateEnergyBySn'
							) &&
							!msg.payload
						)
					)
					{
						Platform.error ('Invalid arguments given!');
					}

					var r = await API.GetData(msg.command, Platform.Serial, msg.payload, Platform.AppID, Platform.AppSecret, Platform);
					break;
			}

			Platform.send(
				{
					origin: msg,
					payload : r
				}
			);
		});

		async function monitor()
		{
			// don't monitor if not expected or no correctly configuration exists...
			if (Platform.Mode !== 0 || !Platform.AppID || !Platform.AppSecret || !Platform.Serial)
			{
				return;
			}

			// let's cache hourly statistics every 10 minutes...
			if (Date.now() > Platform.Cache.Hourly.LastQuery + (1000 * 60 * 10)) {
				//TBD

				Platform.Cache.Hourly.LastQuery = Date.now();
			}

			// let's cache daily statistics every 10 minutes...
			if (Date.now() > Platform.Cache.Daily.LastQuery + (1000 * 60 * 10)) {
				var r = await API.FetchTodaysData(Platform.Serial, Platform.AppID, Platform.AppSecret, Platform);
				Platform.Cache.Daily.Statistics = r ?? {
					eCharge: 0,
					eChargingPile: 0,
					eDischarge: 0,
					eGirdCharge: 0,
					eInput: 0,
					eOutput: 0,
					epv: 0
				};

				Platform.Cache.Daily.LastQuery = Date.now();
			}

			// let's cahce monthly statistics every hour...
			if (Date.now() > Platform.Cache.Monthly.LastQuery + (1000 * 60 * 60)) {
				//TBD

				Platform.Cache.Monthly.LastQuery = Date.now();
			}

			var r = await API.FetchRealTimeData(Platform.Serial, Platform.AppID, Platform.AppSecret, Platform);
			Platform.ProcessData(
				r ??
				{
					ppv: 0,
					pload: 0,
					soc: 0,
					pgrid: 0,
					pbat: 0,
					pev: 0
				}
			);
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
			appid:		{type: "text"},
			appsecret:	{type: "password"},
			serial:		{ type: "text" }
		}
	});

	// ~~~ ui API endpoints ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

	RED.httpAdmin.get(
		"/systems",
		RED.auth.needsPermission('systems.read'),
		async function(myRequest, myResponse) {
			myResponse.json(await API.FetchSystemList(Platform.AppID, Platform.AppSecret, Platform) ?? []);
		}
	);

	// ~~~ functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

	AlphaESS.prototype.ProcessData = function(myData) {
		var Platform = this;

		Platform.debug('Processing data...');

		Platform.send({ 
			'code': myData.code,
			'info': myData.info,
			'payload': {
				'consumption':	myData.ppv + myData.pbat + myData.pgrid,
				'grid':			myData.pgrid,
				'modules':		myData.ppv,
				'battery': {
					'soc': myData.soc,
					'load': myData.pbat
				},
				'today': {
					'consumption':
						Platform.Cache.Daily.Statistics.eDischarge + Platform.Cache.Daily.Statistics.eChargingPile,
					'grid': {
						'supply': Platform.Cache.Daily.Statistics.eOutput,
						'purchase': Platform.Cache.Daily.Statistics.eInput
					},
					'modules':
						Platform.Cache.Daily.Statistics.epv,
					'battery': {
						'charge': Platform.Cache.Daily.Statistics.eCharge,
						'discharge': Platform.Cache.Daily.Statistics.eDischarge
					}
				},
				'rawdata': {
					'realtime': myData,
					'statistics': {
						'hourly': Platform.Cache.Hourly.Statistics,
						'daily': Platform.Cache.Daily.Statistics,
						'monthly': Platform.Cache.Monthly.Statistics
					}
				}
			}
		});
	}
};