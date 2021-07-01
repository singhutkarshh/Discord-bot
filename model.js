const mongoose = require("mongoose");

const postSchema = mongoose.Schema({
    key:{
        type:String,
        required:true
    },
    value:{
        type:String,
        required:true
    }

});

const post = mongoose.model("filters" , postSchema);

module.exports =  post;