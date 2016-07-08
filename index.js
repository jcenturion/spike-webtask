const Sandbox = require('sandboxjs');
const generator = require('./template/webtask');

const code = generator([{ 
  method: 'get', 
  path: '/', 
  code: 'function(req, res){console.log();}'
}, {
  method: 'post',
  path:'/test',
  code: 'function(req, res, next){res.json(req.webtaskContext.secrets)}'
}, {
  method: 'get',
  path:'/public',
  code: 'function(req, res, next){res.json(req.webtaskContext.secrets)}',
  options: {
    is_public: true
  }
}, {
  method: 'put',
  path:'/token',
  code: 'function(req, res, next){res.json(req.webtaskContext.secrets)}',
  options: {
    is_public: false,
    uses_api2: true
  }
}]);

const token = process.env.WEBTASK_TOKEN;

const profile = Sandbox.fromToken(token);
profile.create(code, { name: 'test', secrets: { auth0: 'rocks' } }, function (err, webtask) {
  if (err) return console.log(err)
  console.log(webtask.url);
});