const logger = require('../logger/logger');
const b2safeAPI = require('../controllers/eudatHttpApiController');

function testToken(token, config, callback) {

  logger.trace();

  b2safeAPI.testToken(token, config, function(data, error) {
    if(error) {
      callback(false, error);            
    } else {
      callback(true, null);            
    }
  });

}


function updateToken(token, db, config, callback) {	

  logger.trace();

  db.collection("user").update(
      { 'username' : config.b2safe.username },
      {
        'username' : config.b2safe.username,
        'token' : token
      },
      { upsert: true },
      function (error, response) {
        callback(response, error);
      }
  );
}


function login(db, config, callback) {

  logger.trace();

  var token = "";
  var response = "";

  b2safeAPI.authenticate(config, function(data, error) {
    if(error) {
      callback(null, error);           
    } else {
      token = data.Response.data.token;
      updateToken(token, db, config, function (response, error){
        if(error) {
          callback(response, error);
        } else {
          callback(data, null);
        }
      });
    }
  });
}

exports.getToken = function(db, config, callback) {	

  logger.trace();

  db.collection('user').findOne({'username' : config.b2safe.username}, function(error, response) {
    if(error) {
      callback(null, error);
    } else {
      testToken(response.token, config, function(valid, error) {
        if(error) {					
          logger.error(error);
          callback(null, error);
        } else
          if(valid) {
            logger.debug("token is valid");
            callback(response.token, null);
          } else {
            logger.debug("token is not valid");
            login(db, config, function(data, error) {
              if(error) {
                callback(null, error);
              } else{
                callback(data.Response.data.token, null);
              }					
            });
          }
      });
    }
  });
}

exports.doLogin = function(req, res, db, config, callback=null) {

  logger.trace();

  login(db, config, function(response, error) {
    if(res) {
      if(error) {
        res.send(error);
      } else {
        res.send(response);
      }
    }
    if(callback) {
      callback(response, error);
    }
  });	
};
