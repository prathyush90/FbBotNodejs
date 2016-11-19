var mongoose = require('mongoose');


var productSchema = new mongoose.Schema({
   
   name:{
   	type:String,
   	default:''
   },
   price:{
     type:String,
      default:'' 
   },
   
   words:[]
   
   
});


 
// add a text index to the tags array 


module.exports = mongoose.model('products',productSchema);