# node-red-contrib-alphaess 

This provides a node for retrieving realtime data and statistical data from Alpha ESS photovoltaic systems. node-red-contrib-alphaess delivers 1 node:

## Alpha ESS Monitoring
Alpha ESS Monitoring normally periodically polls the realtime data from Alpha ESS Monitoring servers. The interval in seconds can be set, must ne at least 10 seconds. It returns consumption, grid power, modules power, battery power, battery soc and addionally all realtime data in raw format.

Additionally Alpha ESS Monitoring polls statistical data on startup and within specific time ranges. It returns daily consumption, daily grid supply, daily grid purchase, daily modules yield, daily battery (dis)charge and additionally all statistical data in raw format.

All data are merged together into one payload.

Before using this node you've to register at [Alpha ESS Open API](https://open.alphaess.com/).

### Manual Mode
You might switch over this node to manual mode. This will provide you to perform queries against Alpha ESS Monitoring via [Alpha ESS Open API](https://open.alphaess.com/). Further you will have the possibility of configuring your system via that API. You can use node's input then with the following message syntax:

<pre>
{
	"topic": "YOURMETHOD",
	"command": "YOURCOMMAND",
	"payload": "YOURPAYLOAD"
}
</pre>

<table>
<tr><th>YOURMETHOD</th><td>You might use GET or POST here for fetching from or configuring your system.</td></tr>
<tr><th>YOURCOMMAND</th><td>You might use here each API call requiring a specific system serial and is listed within <a href="https://open.alphaess.com/">Alpha ESS Open API Documentation</a>.</td></tr>
<tr><th>YOURPAYLOAD</th><td>The payload depends on the command used. If there isn't a requested parameter, leave blank. If there is a date parameter, provide it in format YYYY-MM-DD. If command requires JSON data, provide it.</td></tr>
</table>