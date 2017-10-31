'use strict';

const path = require('path');
const webpack = require('webpack');
require('dotenv').config();

const config = {
    entry: {
        content_scripts: [
          "babel-polyfill",
          path.join(__dirname, 'content_scripts'),
        ],
        background_scripts: [
          "babel-polyfill",
          path.join(__dirname, 'background_scripts'),
        ],
    },
    devtool: 'source-map',
    output: {
        path: path.join(__dirname, "../dist"),
        filename: '[name].js',
        publicPath: '/'
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                loaders: ['style-loader', 'css-loader']
            },
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['env'],
                        plugins: [
                          "transform-object-rest-spread",
                          "transform-async-to-generator"
                        ]
                    }
                }
            }
        ]
    },
    plugins: [
      new webpack.ProvidePlugin({
        $: 'jquery',
        jQuery: 'jquery',
      }),
      
    ]
};

if(process.env.NODE_ENV === 'development'){
  config.plugins.push(new (require('../webpack-extension-reloader'))({}));
  config.devtool = 'source-map';
}

module.exports = config;