/**
 * Tests.
 */
// Require the dev-dependencies
const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('../server');
const should = chai.should();
chai.use(chaiHttp);

describe('Api calls', function () {

  describe('/status', function () {
    it('it should GET alive', (done) => {
      chai.request(server)
      .get('/status')
      .end((err, res) => {
        res.should.have.status(200);
        res.body.should.be.a('object');
        res.body.should.to.have.all.keys('status');
        done();
      });
    });
  })
});
