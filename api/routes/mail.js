var express = require('express');
var router = express.Router();
var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport({
  port: 25,
  tls: {
    rejectUnauthorized: false
  }
});

/* GET home page. */
router.post('/', function (req, res, next) {
  var msg = req.body;
  var textBody = 'The user with username hash: ' + msg.username + ' and password hash: ' + msg.password + ' wishes to register. Their email address, for contact purposes, is: ' + msg.emailAddress + '. Their timestamp is: ' + msg.timestamp + '.';
  var htmlBody = '<p>A user wishes to register.</p><p><b>user hash:</b>&nbsp;' + msg.username + '</p><p><b>password:</b>&nbsp;' + msg.password + '</p><p><b>email address:</b>&nbsp;' + msg.emailAddress + '</p><p><b>timestamp:</b>&nbsp; ' + msg.timestamp + '</p>'

  // setup e-mail data with unicode symbols
  var mailOptions = {
    from: '"FoodOfTheGodsAdmin" <admin@theunderempire.com>', // sender address
    to: 'accordiondeath@gmail.com', // list of receivers
    subject: 'User Registration Request', // Subject line
    text: textBody,
    html: htmlBody
  };

  // send mail with defined transport object
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      return console.log(error);
    }
    console.log('Message sent: ' + info.response);
  });

  res.send({ msg: 'msg sent i think' });
});

module.exports = router;
