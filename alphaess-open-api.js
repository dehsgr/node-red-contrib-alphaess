// ~~~ dependencies ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const CRYPTO = require('crypto');
const HTTP = require('axios');

// ~~~ constants ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const BaseURI = 'https://openapi.alphaess.com/api/';

// ~~~ exports ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

module.exports = {

	// ~~~ enums ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

	API : {
		GET : {
			SystemList : 'getEssList',
			Realtime : 'getLastPowerData',
			Today : 'getOneDateEnergyBySn'
		},
		POST : {

		},
		ERROR : {
			0000 : 'Generic error',
			6001 : 'Parameter error',
			6002 : 'The SN is not bound to the user',
			6003 : 'You have bound this SN',
			6004 : 'CheckCode error',
			6005 : 'This appId is not bound to the SN',
			6006 : 'Timestamp error',
			6007 : 'Sign verification error',
			6008 : 'Set failed',
			6009 : 'Whitelist verification failed',
			6010 : 'Sign is empty',
		},
	},

	// ~~~ functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

	FetchSystemList : async function(myAppID, myAppSecret, myLogger)
	{
		myLogger.trace('Fetching system list...');
		return await this.GetData(this.API.GET.SystemList, undefined, undefined, myAppID, myAppSecret, myLogger);
	}, 

	FetchRealTimeData : async function(mySN, myAppID, myAppSecret, myLogger)
	{
		myLogger.trace('Fetching realtime data...');
		return await this.GetData(this.API.GET.Realtime, mySN, undefined, myAppID, myAppSecret, myLogger);
	}, 

	FetchTodaysData : async function(mySN, myAppID, myAppSecret, myLogger)
	{
		myLogger.trace('Fetching todays data...');
		
		var today = new Date().toISOString().slice(0, 10);
		
		return await this.GetData(this.API.GET.Today, mySN, today, myAppID, myAppSecret, myLogger);
	},

	GetData : async function(myFunction, mySN, myDate, myAppID, myAppSecret, myLogger)
	{
		myLogger.debug(`Getting data via ${myFunction}...`);
		
		var snParm = mySN ? `?sysSn=${mySN}` : '';
		var dateParm = myDate ? `&queryDate=${myDate}` : '';
		
		return await RequestHTTP(`${myFunction}${snParm}${dateParm}`, myAppID, myAppSecret, myLogger);
	},

	SetData : async function(myFunction, mySN, myData, myAppID, myAppSecret, myLogger)
	{
		myLogger.debug(`Posting data via ${myFunction}...`);
		
		myData.sysSn = mySN;
		
		return await RequestHTTP(`${myFunction}`, myAppID, myAppSecret, myLogger, 'POST', myData);
	},
}

// ~~~ private functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

GetHeaders = function (myAppID, myAppSecret, myAdditionalHeaders)
{
	const crypto = require("crypto");

	var headers = {
		'appId': myAppID,
		'timeStamp': Math.round(Date.now() / 1000),
		'sign': undefined,
	}

	var data = myAppID + myAppSecret + headers.timeStamp;
	headers.sign = crypto.createHash("sha512").update(data).digest('hex');

	return Object.assign({}, headers, myAdditionalHeaders);
}

RequestHTTP = async function (myURI, myAppID, myAppSecret, myLogger, myVerb = 'GET', myData)
{
	try {
		myLogger.trace(JSON.stringify(
			{
				method: myVerb,
				url: BaseURI + myURI,
				gzip: true,
				headers: GetHeaders(myAppID, myAppSecret, { 'Content-Type': 'application/json' }),
				data: myData
			}			
		));

		var r = await HTTP({
			method: myVerb,
			url: BaseURI + myURI,
			gzip: true,
			headers: GetHeaders(myAppID, myAppSecret, { 'Content-Type': 'application/json' }),
			data: myData
		});

		if (r.status !== 200)
		{
			throw 'We got an error from Aplha ESS API!';
		}
	
		r = r.data;
	}
	catch (myError)
	{
		r = {
			code: 0,
			msg: myError,
			data: undefined
		};
	}

	if (r.code !== 200 && myLogger)
	{
		myLogger.error(
			'There was an error communicating with Alpha Services: ' +
			(r.msg ?? module.exports.API.ERROR[r.code]) + ' (' + r.code + ')'
		);
	}

	return r.data;
}