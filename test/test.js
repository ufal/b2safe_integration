/**
 * Tests.
 */
//Require the dev-dependencies
let chai = require('chai');
let chaiHttp = require('chai-http');
let server = require('../server');
let should = chai.should();
chai.use(chaiHttp);

describe('Api calls', function () {

    describe('/alive', function () {
        it('it should GET alive', (done) => {
            chai.request(server)
                .get('/alive')
                .end((err, res) => {
                    res.should.have.status(200);
                    res.body.should.be.a('object');
                    res.body.should.to.have.all.keys('status');
                    done();
                });
        });
    })
});
