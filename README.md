# node-red-contrib-alphaess 

This provides a node for retrieving realtime data and statistical data from Alpha ESS photovoltaic systems. node-red-contrib-alphaess delivers 1 node:

## Alpha ESS Monitoring
Alpha ESS Monitoring periodically polls the realtime data from Alpha ESS Monitoring servers. The interval in seconds can be set. It returns consumption, grid power, modules power, battery power, battery soc and addionally all realtime data in raw format.

Additionally Alpha ESS Monitoring polls statistical data on startup and every 10 minutes. It returns daily consumption, daily grid supply, daily grid purchase, daily modules yield, daily battery (dis)charge and additionally all statistical data in raw format.

All data are merged together into one payload.

Within settings there is an option to activate a backup path for fetching realtime data. This is for older devices where pseudo realtime data are providedonly around every 5 minutes.