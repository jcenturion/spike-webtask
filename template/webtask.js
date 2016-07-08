module.exports = function createWebtask(data){
  // TODO: Quizas haya que borrar cosas del contexto de webtask -
  // TODO: Tal vez preferimos pasarle parametros especificos a la funcion para que no rompa todo
  // TODO: Validar que no ponga rutas y path duplicados
  
  if (typeof data == 'object' && !Array.isArray(data)){
    // JSON object, lets make it an array of 1 object
    data = [data];
  }

  function getMiddlewares(options){
    var middlewares = [];
    if (!(options && options.is_public)){
      middlewares.push('authorizationMiddleware');
    }

    if (options && options.uses_api2 && !options.is_public){
      middlewares.push('getAccessTokenMiddleware');
    }

    return middlewares;
  }

  function getApplicationDefinition(endpoint){
    const middlewares = getMiddlewares(endpoint.options);

    return `
      app.${endpoint.method.toLowerCase()}('${endpoint.path.toLowerCase() || '/'}', 
        ${middlewares.length ? middlewares.toString() + ',' : ''}        
        function (req, res, next) {
          const code = ${endpoint.code || function(req, res){}.toString() };
          const arity = code.length;

          if (arity === 2){
            code(req, res);
          } else if (arity === 3){
            code(req, res, next)
          }
        },
        endMiddleware
      );
    `
  }

  function getAccessTokenMiddleware(req, res, next){
    const context = req.webtaskContext;
    context.storage.get(function (err, data) {
      if (err) return res.status(400).json(err);
      
      if (data && data.access_token && jwt.decode(data.access_token).exp < Date.now()){
        // Token didn't expire, use it again
        return next(null, data.access_token);
      }
      
      const options = {
        url: 'https://' + context.data.ACCOUNT_NAME + '.auth0.com/oauth/token',
        json: {
          audience: 'https://' + context.data.ACCOUNT_NAME + '.auth0.com/api/v2/',
          grant_type: 'client_credentials',
          client_id: context.data.CLIENT_ID,
          client_secret: context.data.CLIENT_SECRET
        }
      };

      return request.post(options, function(err, response, body){
        if (err) return res.status(400).json(err);
        
        // Store token in context
        context.storage.set({ access_token: body.access_token }, function(err){
          req.auth0.access_token = body.access_token;
          next();
        });
      });
    });
  }

  function authorizationMiddleware(req, res, next){
    if (!req.headers['authorization']){ return res.status(401).json({err : 'unauthorized', error_details: 'Missing authorization header'}); }
    if (req.headers['authorization'].split(' ').length !== 2){ return res.status(401).json({err : 'unauthorized', error_details: 'Invalid authorization header format' }); }
    
    const context = req.webtaskContext;
    const token = req.headers['authorization'].split(' ')[1];
    var secret;
    
    try{
      secret = new Buffer(context.data.APPLICATION_CLIENT_SECRET, 'base64')
    } catch(e){
      return res.status(401).json({err : 'unauthorized', error_details: 'Invalid token' });      
    }

    return jwt.verify(token, secret, function(err, decoded) {
      if (err){ return res.status(401).json({err : 'unauthorized', error_details: 'Invalid Token'}); }
      
      req.user = decoded;
      next();
    });
  }

  function endMiddleware(req, res, next){
    // TODO: maybe we want to handle something here
    next();
  }

  return `
    "use latest";

    const jwt     = require('jsonwebtoken');
    const request = require('request');
    const express = require('express');
    const Boom    = require('boom@2.7.2');
    const Webtask = require('webtask-tools');
    const app     = express();

    ${data.map((endpoint) => {
      // Remove endpoint with invalid methods
      if (!endpoint.method || ['get', 'post', 'put', 'delete'].indexOf(endpoint.method.toLowerCase()) === -1){
        return '';
      }

      return getApplicationDefinition(endpoint);
    }).join('')}
    
    ${authorizationMiddleware.toString()}
    ${getAccessTokenMiddleware.toString()}
    ${endMiddleware.toString()}

    module.exports = Webtask.fromExpress(app);`;
};