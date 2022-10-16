# node-red-contrib-alphaess 

This provides a node for retrieving realtime data and statistical data from Alpha ESS photovoltaic systems. node-red-contrib-alphaess delivers 1 node:

## Alpha ESS Monitoring
Alpha ESS Monitoring periodically polls the realtime data from Alpha ESS Monitoring servers. The interval in seconds can be set. It returns consumption, grid power, modules power, battery power, battery soc and addionally all realtime data in raw format.

Additionally Alpha ESS Monitoring polls statistical data on startup and every 10 minutes. It returns daily consumption, daily grid supply, daily grid purchase, daily modules yield, daily battery (dis)charge and additionally all statistical data in raw format.

All data are merged together into one payload.

Within settings there is an option to activate a backup path for fetching realtime data. This is for older devices where pseudo realtime data are providedonly around every 5 minutes.

# Additional Information
Since 2022/10/16 Alpha ESS introduced signature verification. Currently the is a workaround implemented to provide authentication signature and authentication timestamp. You can retrieve that data e.g. by the following steps:
1. Open your browsers web console (e.g. via [F12] key) after logging in.
2. Switch to network tab and find one of the GetLastPowerDataBySN calls.
3. Select GetLastPowerDataBySN call to get its details.
4. You'll find signature and timestamp in the request header fields (authenticationsignature and authenticationtimestamp).

You might tryout the follow information:
- Authentication Signature: al8e4s52048581de93e0c6f04f0aab0e4a8eb06aeef0e72da4925f2dfe250108f85af5703e4585c973ec3be426a7a69d2eccd8867e3e74b54e80897173d21046db9931ui893ed
- Authentication Timestamp: 1665923143