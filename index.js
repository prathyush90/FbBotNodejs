'use strict';

const 
  bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),  
  request = require('request'),
  XLSX     = require('xlsx'),
  PROBABILITY_THRESHOLD = 0.15,
  mongoose = require('mongoose');


var app = express();
app.set('port', process.env.PORT || 8080);
app.set('view engine', 'ejs');
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));

var productSchema = require('./models/products');
mongoose.connect("mongodb://user:user@ds157667.mlab.com:57667/fbbot");
var mongodb       = mongoose.connection.db;
const APP_SECRET = (process.env.MESSENGER_APP_SECRET) ? 
  process.env.MESSENGER_APP_SECRET :
  config.get('appSecret');

// Arbitrary value used to validate a webhook
const VALIDATION_TOKEN = (process.env.MESSENGER_VALIDATION_TOKEN) ?
  (process.env.MESSENGER_VALIDATION_TOKEN) :
  config.get('validationToken');

// Generate a page access token for your page from the App Dashboard
const PAGE_ACCESS_TOKEN = (process.env.MESSENGER_PAGE_ACCESS_TOKEN) ?
  (process.env.MESSENGER_PAGE_ACCESS_TOKEN) :
  config.get('pageAccessToken');

// URL where the app is running (include protocol). Used to point to scripts and 
// assets located at this address. 
const SERVER_URL = (process.env.SERVER_URL) ?
  (process.env.SERVER_URL) :
  config.get('serverURL');

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
  console.error("Missing config values");
  process.exit(1);
}

class Trie{
	constructor(){
		this.childNodes = {};
		this.word       = "";
	}

	getChildNode(char){
		if(!this.childNodes[char]) {
			this.childNodes[char] = new Trie();
		}
			
	return this.childNodes[char];
		
	}
	getChildNodeMap(){
		return this.childNodes;
	}
	setWord(word){
		this.word   = word;	
	}
	getWord(){
		return this.word;
	}

	isWord(){
		if(this.word != ""){
			return true;
		}else{
			return false;
		}
	}

}

// function Trie(){
// 	this.childNodes = {};
//     this.word       = "";
// }

// Trie.prototype.getChildNode = function(char){
// 	if(this.childNodes[char] === null) {
// 		return new Trie();
// 	}else{
// 	return this.childNodes[char];
// 	}
// }
// Trie.prototype.setWord = function(word){
//     this.word   = word;	
// }

var trie   = new Trie();

 function insertWordTrie(word){
 	var letters = word.split("");
     var curNode = trie;
     for(var j=0;j<letters.length;j++){
     	var letter = letters[j];
     	curNode   = curNode.getChildNode(letter);
     	if(j==letters.length-1){
         curNode.setWord(word);
     	}
     }
 }

function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an 
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', APP_SECRET)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

function insertData(object){
	var product = object['Product'];
      var price   = object['Price'];
      var words   = product.toLowerCase().split(" ");
      var productData = {};
      productData['name']  = product;
      productData['price'] = price;
      productData['words'] = words;

      productSchema.findOne({'name':product},function(ee,docs){
        if(docs == null){
        	new productSchema(productData).save(function(e,result){
		    	if(e) console.log(e);
            });
        }
      });
      words.forEach(function(word){
      	insertWordTrie(word.toLowerCase());
      });


      
}

function getSuggestions(word,results){
	var currentrow = [];
	for(var i=0;i<word.length+1;i++){
     currentrow[i] = i;
	}
	for(var letter in trie.getChildNodeMap()){

		searchRecursive(trie.getChildNode(letter),letter,word,currentrow,results);
	}
	
}

function searchRecursive(node,letter,word,previousrow,results){
	var currentrow = [];
	for(var i=0;i<word.length+1;i++){
     currentrow[i] = 0;
	}
	var columns    = word.length+1;
	currentrow[0]  = previousrow[0]+1;

	for(var i=1;i<columns;i++){
		var cost1  = currentrow[i-1];
		var cost2  = previousrow[i];
		var cost3  = previousrow[i-1];
		var cost   = 0;
		if(word.charAt(i-1) != letter){
			cost = 1;
		}
        //console.log(cost1 +"-->"+cost2+"-->"+cost3);
		currentrow[i] = Math.min(cost1,Math.min(cost2,cost3))+cost;
		//console.log(currentrow);
	}

    if(currentrow[columns - 1]<=2 & node.isWord()){
    	if(node.getWord() == 'paneer'){
    		console.log(">>>"+currentrow[columns-1]);
    	}
    	if(arrayObjectIndexOf(results,node.getWord()) === -1){
			var obj            = {};
			obj['word']        = node.getWord();
			var denom          = ((Math.abs(node.getWord().length-word.length)+1)*currentrow[columns-1])+1; 
			var probability    = 1/denom;
			obj['probability'] = probability;
			results.push(obj);
		}else{
			var denom          = ((Math.abs(node.getWord().length-word.length)+1)*currentrow[columns-1])+1; 
			var probability    = 1/denom;
			var index          = arrayObjectIndexOf(results,node.getWord(),'word');
			var obj            = results[index];
			if(obj['probability']<probability){
				obj['probability'] = probability;
			}
			results[index] = obj;
		}
	}

	if(getMinOfArray(currentrow)<=2){
            for(var letter1 in node.getChildNodeMap()){
		searchRecursive(node.getChildNode(letter1),letter1,word,currentrow,results);
	       	}
        }
}

function getMinOfArray(numArray) {
  return Math.min.apply(1000000000, numArray);
}

function arrayObjectIndexOf(myArray, searchTerm) {
    for(var i = 0, len = myArray.length; i < len; i++) {
    	if (myArray[i]['word'] === searchTerm) return i;
    }
    return -1;
}






function readExcel(){
	var workbook  = XLSX.readFile('product_list.xlsx');
    var sheet_name_list = workbook.SheetNames;
    var json = XLSX.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);
    json.forEach(function(object){
    	insertData(object);
    });
    var results = [];
    

    
    
}

function recievedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback 
  // button for Structured Messages. 
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " + 
    "at %d", senderID, recipientID, payload, timeOfPostback);

  // When a postback is called, we'll send a message back to the sender to 
  // let them know it was successful
  sendTextMessage(senderID, "Order Recieved.Pay option needs a U.S registered company.Sorry :)");
}


function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;
  var messageText = message.text;
  var queries     = messageText.toLowerCase().split(" ");
  var results     = [];
  queries.forEach(function(query){
     getSuggestions(query,results);
  });
  console.log(results);
  var suggestionlist = [];
  results.forEach(function(obj){
    suggestionlist.push(obj.word);
  });
  var productList = [];
  productSchema.find({'words':{$in:suggestionlist}},function(error,docs){
      docs.forEach(function(singledoc){
      var words = singledoc.words;
      var totalScore = 1;
      var count   = 0;
      words.forEach(function(word){
      	if(suggestionlist.indexOf(word) != -1){
      		count++;
      		var index           = arrayObjectIndexOf(results,word);
      	    var wordProbability = results[index]['probability'];
      		totalScore          += wordProbability;
      	}
      });
      var probability = (count*totalScore) / words.length;
      if(probability >= PROBABILITY_THRESHOLD){
      	var obj = {};
      	obj.probability = probability;
      	obj.product     = singledoc.name;
      	productList.push(obj);
      }
      });
      productList.sort(function(a,b){
      	return (parseFloat(b.probability).toFixed(4) - parseFloat(a.probability).toFixed(4));
      });
       console.log(productList);
      var finalIndex = productList.length;
      if(productList.length>3){
       finalIndex  = 3;
      }
      var buttonData = productList.splice(0,finalIndex);
      if(buttonData.length == 0){
          sendTextMessage(senderID,"No results found for your query");
      }else{
       sendButtonMessage(senderID,buttonData);
     }
  });
  
  
}
function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText,
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
}

function sendButtonMessage(recipientId,productList) {
	var array = [];
	productList.forEach(function(product){
      var obj  = {};
      obj.type    = "postback";
      obj.title   = product.product;
      obj.payload = product.product;
      array.push(obj);
	});
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Found the following items:",
          buttons:array
        }
      }
    }
  }; 
  callSendAPI(messageData); 
}

function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      if (messageId) {
        console.log("Successfully sent message with id %s to recipient %s", 
          messageId, recipientId);
      } else {
      console.log("Successfully called Send API for recipient %s", 
        recipientId);
      }
    } else {
      console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
    }
  });  
}

app.get('/',function(req,res){
res.status(200).send(req.query['hub.challenge']);
});

app.get('/webhook', function(req, res) {
	console.log('recieved');
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === VALIDATION_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);          
  }  
});



app.post('/webhook', function (req, res) {
  var data = req.body;

  if (data.object == 'page') {
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      pageEntry.messaging.forEach(function(messagingEvent) {
        if(messagingEvent.message){
            receivedMessage(messagingEvent);
        }else if(messagingEvent.postback){
        	recievedPostback(messagingEvent);
        }
      });
    });
}
  

    res.sendStatus(200);
  
});













app.listen(app.get('port'), function() {
  console.log('app is running on port : ', app.get('port'));
  readExcel();
});