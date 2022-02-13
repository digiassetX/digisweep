const path = require('path');
const webpack = require("webpack");

module.exports = {
    entry: './index.js',
    output: {
        filename: 'min.js',
        path: path.resolve(__dirname, 'dist'),
        publicPath: '/'
    },
    plugins: [
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
        }),
    ],
    resolve: {
        fallback: {
            "buffer": require.resolve("buffer/"),
            "crypto": require.resolve("crypto-browserify"),
            "constants": require.resolve("constants-browserify"),
            "assert": require.resolve("assert/"),
            "url": require.resolve("url/"),
            "stream": require.resolve("stream-browserify"),
            "events": require.resolve("events/"),
            "gibberish-aes": require.resolve("gibberish-aes/src/gibberish-aes.js")
        }
    },
    optimization: {
        minimize: false
    },
    performance: { hints: false }
};