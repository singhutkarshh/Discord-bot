const discord = require("discord.js");
const fetch = require("node-fetch");
const  mongoose  = require("mongoose");
const filters = require("./model.js")
const { URI, token } = require("./config.json");
const ytdl = require("ytdl-core");

mongoose
  .connect(URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
   console.log("Database connected successfully!");
  })
  .catch((error) => {
    console.log("Connection failed ", error.message);
  });

const client = new discord.Client();
const queue = new Map();

const  GetQuote = () =>{
    return fetch("https://zenquotes.io/api/random")
    .then(res => {return res.json()}).then(data => {
      return data[0]["q"]+"-"+data[0]["a"]
    })
  };


client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});
client.on("disconnect", () => {
    console.log(`Disconnected!`);
});
client.on("reconnect", () => {
    console.log(`Reconnecting!`);
});



client.on("message", (msg) => {
  if(msg.author.bot){
    return;
  }
  else if(msg.content === `$inspire`){
    GetQuote().then((quote)=>msg.channel.send(quote));
  }

  else if(msg.content === `$help`){
      msg.channel.send(
          `
          List of Commands :-
          format => $command
          help => get  the list of commands
          inspire => get  mpotivational quotes
          setfilter => adds a filter  for messages
          remfilter => removes those filters ; 
          filters => shows all the filters

          Music Commands:-
          play , skip , stop
          `
      )
  }

  else if(msg.content.startsWith("$setfilter")){
     let index1=0 , index2=0 ,s=msg.content , count=0;
     for(let i=0 ; i < s.length ; i++){
        if(s[i] == ' '){
            count++;
            if(count==2){
                index2 = i;
                break;
            }
            index1=i;
        }
     }
     if(index1==0 || index2==0 || index1==index2){
        msg.channel.send("Use proper format for adding filter!");
     }
     else{
        const post = new filters({
            key:s.substr(index1+1 , index2-index1-1),
            value:s.substr(index2+1)
        })
        post.save().then(()=>{
            msg.channel.send("filter added successfully!");
        }).catch(()=>{
            msg.channel.send("Something went wrong! Try again later.")
        })
     }
  }
  
  else if(msg.content.startsWith("$remfilter")){
      let args = msg.content.split(" ");
      if(args[2]){
          msg.channel.send("Use proper format or remove only one filter at a time.")
      }
      else{
          console.log(args[1]);
        filters.findOneAndDelete({key:args[1] }, (err, note) => {
            if (err) {
              return console.log(err.message);
            }
        
            if (!note) {
              return msg.channel.send("Filter already not present");
            }
        
            return msg.channel.send("filter removed!")
          }).catch((err) => console.log(err));
      }
  }
  else if(!msg.content.includes("$")){

   
    filters.find().then(data =>{
      console.log(data);
      data.forEach((item , index) => {
          if(msg.content.includes(item.key)){
              msg.channel.send(item.value);
          }
      });
    });

  }
  else if(msg.content === "$filters"){
    filters.find().then(data =>{
      let s="";
      data.forEach((item)=>{
        s+=`${item.key} , `;
      })
      msg.channel.send(
      `${data.length} filters found! ${s}
      `
      )
    });

  }
});

//Music Functionalities

client.on("message", async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith("$")) return;

  const serverQueue = queue.get(message.guild.id);

  if (message.content.startsWith(`$play`)) {
    execute(message, serverQueue);
    return;
  } else if (message.content.startsWith(`$skip`)) {
    skip(message, serverQueue);
    return;
  } else if (message.content.startsWith(`$stop`)) {
    stop(message, serverQueue);
    return;
  } else {
    message.channel.send("You need to enter a valid command!");
  }
});

async function execute(message, serverQueue) {
  const args = message.content.split(" ");

  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel)
    return message.channel.send(
      "You need to be in a voice channel to play music!"
    );
  const permissions = voiceChannel.permissionsFor(message.client.user);
  if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
    return message.channel.send(
      "I need the permissions to join and speak in your voice channel!"
    );
  }

  const songInfo = await ytdl.getInfo(args[1]);
  const song = {
        title: songInfo.videoDetails.title,
        url: songInfo.videoDetails.video_url,
   };

  if (!serverQueue) {
    const queueContruct = {
      textChannel: message.channel,
      voiceChannel: voiceChannel,
      connection: null,
      songs: [],
      volume: 5,
      playing: true
    };

    queue.set(message.guild.id, queueContruct);

    queueContruct.songs.push(song);

    try {
      var connection = await voiceChannel.join();
      queueContruct.connection = connection;
      play(message.guild, queueContruct.songs[0]);
    } catch (err) {
      console.log(err);
      queue.delete(message.guild.id);
      return message.channel.send(err);
    }
  } else {
    serverQueue.songs.push(song);
    return message.channel.send(`${song.title} has been added to the queue!`);
  }
}

const skip = (message, serverQueue) => {
  if (!message.member.voice.channel)
    return message.channel.send(
      "You have to be in a voice channel to stop the music!"
    );
  if (!serverQueue)
    return message.channel.send("There is no song that I could skip!");
  serverQueue.connection.dispatcher.end();
}

const stop = (message, serverQueue) =>{
  if (!message.member.voice.channel)
    return message.channel.send(
      "You have to be in a voice channel to stop the music!"
    );
    
  if (!serverQueue)
    return message.channel.send("There is no song that I could stop!");
    
  serverQueue.songs = [];
  serverQueue.connection.dispatcher.end();
}

const play = (guild, song) => {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.voiceChannel.leave();
    queue.delete(guild.id);
    return;
  }

  const dispatcher = serverQueue.connection
    .play(ytdl(song.url))
    .on("finish", () => {
      serverQueue.songs.shift();
      play(guild, serverQueue.songs[0]);
    })
    .on("error", error => console.error(error));
  dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
  serverQueue.textChannel.send(`Start playing: **${song.title}**`);
}


client.login(token);
