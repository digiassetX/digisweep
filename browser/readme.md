execute to rebuild index.js in to min.js
dist folder contains the usable web page

webpack --config webpack.config.js

curl -s https://digisweep.digiassetx.com/min.js | openssl dgst -sha512 -binary | openssl enc -base64 -A