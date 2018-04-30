var express = require('express');
var router = express.Router();
var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport();

/* GET home page. */
router.post('/', function(req, res, next) {
    // setup e-mail data with unicode symbols
    var mailOptions = {
        from: '"Fred Foo ?" <foo@blurdybloop.com>', // sender address
        to: 'accordiondeath@gmail.com', // list of receivers
        subject: 'Hello ✔', // Subject line
        text: 'Hello world ?', // plaintext body
        html: '<b>Hello world ?</b>' // html body
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, function(error, info){
        if(error){
            return console.log(error);
        }
        console.log('Message sent: ' + info.response);
    });

    res.send({msg: 'msg sent i think'});
});

module.exports = router;
