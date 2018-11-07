/*
 * Slack Shared Library
 *
 *  This shared library is for interacting with Slack to create a channel, retrieve channel history, and to get user info.
 *
 *  Exposed methods:
 *    createChannel   - Creates a new Slack channel with the given name and return the channel info.
 *                      If the channel already exists, retrieve the details and return those
 *        Parameters:
 *        channelName - The name of the channel to create
 *
 *    getTeam         - Gets the Slack team info. Handy for creating links to channels
 *
 *    getChannel      - Gets the channel details. There isn't a good API for getting a specific channel by name, so we
 *                      have to iterate through each channel to get it.
 *       Parameters:
 *       channelName  - The name of the channel to retrieve
 *
 *    archiveChannel  - Archives the channel
 *
 *    getRoomHistory  - Gets the room (channel) chat history.
 *       Parameters:
 *       channelName  - required - The name of the channel to get
 *       count        - optional - The number of messages to get (the API defaults to 100)
 *       latest       - optional - The end of time range to include in results
 *       oldest       - optional - The start of the time range to get
 *
 *    getUserInfo     - Gets the User info based on the User's id. The history returns the userid, not the username, so this can translate
 *      Parameters:
 *      username      - The userid of the user to get (ex. U1234567890)
 *
 *    inviteToChannel - Invites a user to the channel
 *      Parameters:
 *      userName      - The username or User ID is required
 *      channelName   - Channel name or Channel ID is required
 *      userId        - The username or User ID is required
 *      channelId     - Channel name or Channel ID is required
 *
 *    channelInvite (BETTER OPTION over inviteToChannel) - Invites the user to the channel and also invites the xMatters bot to the channel.
 *                                  If either the User or xMatters bot is already on the channel a message is posted to the channel
 *                                  with a message to the user indicating so. I.e. @Troy is already in the channel (which will cause a notification to that user on Slack)
 *      Parameters:
 *      slackUser     - required - This is the Slack User body returned from the getUserInfo function
 *      slackChannel  - required - This is the Slack Channel body returned from the getChannel function
 *
 *    postMessage     - Posts a message to the channel passed in the payload. (Payload details here: https://api.slack.com/methods/chat.postMessage)
 *       payload      - required - The chat.postMessage payload. See below for an example.
 *
 *    postMessageWithFields - Provides the ability to post a message in a channel with a direct message to a user
 *                            I.e. @Troy is already in the channel (this provides an notification to the user in Slack)
 *      Parameters:
 *      text          - required - the text to display in the
 *      channelName   - required -
 *      slackUser     - required -
 *
 *  Usage:

     // * Import the Slack shared library
     var Slack = require( 'Slack' );


    // * getRoomHistory
    // * Get the room (channel) history and build the text for insertion into a Service Desk ticket for example.
    // * The format will be Service Desk platform dependent. See the README.md file for details
    chatData = Slack.getRoomHistory( room.toLowerCase() );
    chatText = buildSlackText( chatData, room.toLowerCase() );


    // * createChannel
    // * Create a channel based on the `number` value and build a link for inclusion in emails
    var channel = Slack.createChannel( data.properties.number );
    var team    = Slack.getTeam();
    data.properties.chat_link = 'https://' + team.name + '.slack.com/messages/#' + data.properties.number;


    // * postMessage
    var text = "My text here. Click <https://xmatters.com | here> for a link!";
    var payload = {
      "channel": "#general",
      "username": "xmatters",
      "icon_url": "https://www.xmatters.com/wp-content/uploads/2016/12/xmatters-x-logo.png",
      "text": text
    };
    Slack.postMessage( payload );


    // * Create Slack Channel Response Option Example
    // * 1.) Creates the Channel in Slack using the Incident Number from the Ticketing System
    // * 2.) Retrieves the Slack Users information from Slack
    // * 3.) Invites the Slack User to the channel (if the user already exists in the channel a message will be posted in the channel)
    // * 4.) Invites the xMatters Bot to the channel (if the bot already exists in the channel a message will be posted in the channel)

    var incidentId = payload.eventProperties.Incident_Number;
    var responder = payload.recipient;

    if (payload.response.toUpperCase() == "CREATE SLACK CHANNEL") {

      //Creating the Channel
      var slackChannel = slack.createChannel(incidentId);

      //Adding the user to the Channel
      var slackUser = slack.getUserInfo(responder);
      slack.channelInvite(slackUser, slackChannel);

      //Adding the xMatters Bot to the newly created Channel
      var xmattersUser = slack.getUserInfo('xmatters');
      slack.channelInvite(xmattersUser, slackChannel);
    }
 *
 */

// Constants
var MAX_CHANNEL_NAME_LENGTH = 21;

exports.createChannel = function(channelName) {
  // Force channel name to max characters, replace spaces with "-", and all lower case
  channelName = channelName.slice(0, MAX_CHANNEL_NAME_LENGTH).replace(/\s+/g, '-').toLowerCase();

  // Prepare the HTTP request
  var slackRequest = http.request({
    'endpoint': 'Slack',
    'method': 'POST',
    'path': '/api/channels.create?token=' + constants["Slack Token"] + '&name=' + channelName
  });

  var channelBody;
  var slackResponse = slackRequest.write();
  var slackBody = JSON.parse(slackResponse.body);
  console.log('Slack Create Channel Response: ' + JSON.stringify(slackBody));

  // If the name is taken, then let's go
  // get the channel
  if (slackBody.error == 'name_taken') {

    console.log('Channel "' + channelName + '" already exists. Getting info.');
    channelBody = this.getChannel(channelName);
  } else {
    channelBody = slackBody.channel;
  }

  return channelBody;
};


exports.getTeam = function() {
  // GET https://slack.com/api/team.info

  var teamBody = null;

  var slackRequest = http.request({
    'endpoint': 'Slack',
    'method': 'GET',
    'path': '/team.info?token=' + constants["Slack Token"]
  });

  var slackResponse = slackRequest.write();
  var body = JSON.parse(slackResponse.body);
  if (body.ok) {
    teamBody = body.team;
  }

  return teamBody;
};

exports.getChannel = function(channelName) {
  // Force channel name to max characters, replace spaces with "-", and all lower case
  channelName = channelName.slice(0, MAX_CHANNEL_NAME_LENGTH).replace(/\s+/g, '-').toLowerCase();

  var page = true;
  var limit = 0; //default is 0, but can update to 1 for testing the loop
  var cursor;
  var parms = '';
  var channelBody = null;

  while (page) {

    parms += (!!limit ? '&limit=' + limit : '');
    parms += (!!cursor ? '&cursor=' + cursor : '');

    var slackRequest = http.request({
      'endpoint': 'Slack',
      'method': 'GET',
      'path': '/api/channels.list?token=' + constants["Slack Token"] + parms
    });

    var slackResponse = slackRequest.write();
    var slackBody = JSON.parse(slackResponse.body);
    if (!slackBody.ok) {
      console.log('Error getting Channel list: ' + slackBody.error);
      break;
    }

    for (var i in slackBody.channels) {
      //console.log('Checking for ' + channelName.toLowerCase() + ' in ' + slackBody.channels[i].name.toLowerCase());

      if (slackBody.channels[i].name.toLowerCase() == channelName.toLowerCase()) {
        channelBody = slackBody.channels[i];
        break;
      }
    }

    if ((null === channelBody) &&
      (typeof slackBody.response_metadata !== 'undefined') &&
      slackBody.response_metadata.next_cursor) {
      cursor = slackBody.response_metadata.next_cursor;
      console.log("Next Cursor  " + cursor);
    } else {
      console.log("No need for next cursor, completing channel search");
      page = false;
    }
  }

  return channelBody;
};


exports.archiveChannel = function(channelName) {
  // Force channel name to max characters, replace spaces with "-", and all lower case
  channelName = channelName.slice(0, MAX_CHANNEL_NAME_LENGTH).replace(/\s+/g, '-').toLowerCase();

  var channel = this.getChannel(channelName);

  var slackRequest = http.request({
    'endpoint': 'Slack',
    'method': 'GET',
    'path': '/api/channels.archive?token=' + constants["Slack Token"] + "&channel=" + channel.id
  });

  var slackResponse = slackRequest.write();
  var slackBody = JSON.parse(slackResponse.body);

};

exports.getRoomHistory = function(channelName, count, latest, oldest) {

  var channel = this.getChannel(channelName);

  if (channel === null) {
    console.log('Channel "' + channelName + '" not found.');
    return null;
  }


  var parms = '';
  parms += '&channel=' + channel.id;
  parms += (!!count ? '&count=' + count : '');
  parms += (!!latest ? '&latest=' + latest : '');
  parms += (!!oldest ? '&oldest=' + oldest : '');

  var slackRequest = http.request({
    'endpoint': 'Slack',
    'method': 'GET',
    'path': '/api/channels.history?token=' + constants["Slack Token"] + parms
  });

  var slackResponse = slackRequest.write();
  var slackBody = JSON.parse(slackResponse.body);
  if (!slackBody.ok) {
    console.log('Error getting Channel history: ' + slackBody.error);
    return null;
  }

  return slackBody.messages;

};

exports.getUserInfo = function(username) {
  // Used to use 'path': '/users.info?token=' + constants["Slack Token"] + '&user=' + encodeURIComponent( userid )

  var page = true;
  var limit = 0; //default is 0, but can update to 1 for testing the loop
  var cursor;
  var parms = '';
  var slackMember = null;

  while (page) {

    parms += (!!limit ? '&limit=' + limit : '');
    parms += (!!cursor ? '&cursor=' + cursor : '');

    var slackRequest = http.request({
      'endpoint': 'Slack',
      'method': 'GET',
      'path': '/api/users.list?token=' + constants["Slack Token"] + parms
    });

    var slackResponse = slackRequest.write();
    var slackBody = JSON.parse(slackResponse.body);
    if (!slackBody.ok) {
      console.log('Error getting user info "' + JSON.stringify(slackBody) + '"');
      break;
    }

    for (var i in slackBody.members) {
      //console.log('Checking for ' + username.toLowerCase() + ' in ' + slackBody.members[i].profile.display_name);

      if (slackBody.members[i].profile.display_name.toLowerCase() == username.toLowerCase() || slackBody.members[i].name.toLowerCase() == username.toLowerCase()) {
        slackMember = slackBody.members[i];
        break;
      }
    }

    if (slackBody.response_metadata.next_cursor) {
      console.log("Next Cursor: " + cursor);
      cursor = slackBody.response_metadata.next_cursor;
    } else {
      console.log("No next cursor found returning null");
      page = false;
    }
  }

  return slackMember;
};

exports.inviteToChannel = function(userName, channelName, userId, channelId) {

  var channel = null;
  if (!channelId) {
    channel = this.getChannel(channelName);
    if (null !== channel) {
      channelId = channel.channel_name;
    } else {
      return null;
    }
  }

  if (!userId) {
    userId = this.getUserInfo(userName);
    if (null === userId) {
      return null;
    }
  }

  var slackRequest = http.request({
    'endpoint': 'Slack',
    'method': 'POST',
    'path': '/api/channels.invite?token=' + constants["Slack Token"] + '&channel=' + channelId + "&user=" + userId,
    'headers': {
      'Content-Type': 'application/json'
    }
  });

  slackResponse = slackRequest.write();


  return slackResponse;

};

exports.channelInvite = function(slackUser, slackChannel) {
  var payload = {};

  payload.channel = slackChannel.id;
  payload.user = slackUser.id;

  payload.token = constants["Slack Token"];
  var qs = jsonToQueryString(payload);

  var slackBody = null;

  var slackRequest = http.request({
    'endpoint': 'Slack',
    'method': 'POST',
    'path': '/api/channels.invite' + qs
  });

  var slackResponse = slackRequest.write(payload);
  slackBody = JSON.parse(slackResponse.body);

  if (!slackBody.ok) {

    //if channel already exists remind user
    if (slackBody.error == "already_in_channel" && slackUser.name.toLowerCase() !== "xmatters") {
      slackBody = this.postMessageWithFields(" already in channel", slackChannel, slackUser);
    } else if (slackUser.name.toLowerCase() == "xmatters") {
      console.log('Disregarding xMatters user already exists in channel');
      slackBody = null;
    } else {
      console.log('Error posting message');
      slackBody = null;
    }
  }

  return slackBody;
};

exports.postMessage = function(payload) {

  payload.token = constants["Slack Token"];
  if (payload.attachments) {
    payload.attachments = JSON.stringify(payload.attachments);
  }

  var qs = jsonToQueryString(payload);

  var slackRequest = http.request({
    'endpoint': 'Slack',
    'method': 'POST',
    'path': '/chat.postMessage' + qs
  });

  var slackResponse = slackRequest.write(payload);
  var slackBody = JSON.parse(slackResponse.body);
  if (!slackBody.ok) {
    console.log('Error posting message!');
    return null;
  }

  return slackBody;

};

exports.postMessageWithFields = function(text, channelName, slackUser) {
  var payload = {};
  payload.channel = channelName.id;

  //To mention a username it must be <@SLACK_USER_ID>
  if (slackUser) {
    payload.text = "<@" + slackUser.id + ">";
  }

  if (text) {
    payload.text += text;
  }

  var slackBody = null;
  payload.token = constants["Slack Token"];
  var qs = jsonToQueryString(payload);

  var slackRequest = http.request({
    'endpoint': 'Slack',
    'method': 'POST',
    'path': '/api/chat.postMessage' + qs
  });

  var slackResponse = slackRequest.write(payload);
  slackBody = JSON.parse(slackResponse.body);
  if (!slackBody.ok) {
    console.log('Error posting message!');
    slackBody = null;
  }

  return slackBody;
};

jsonToQueryString = function(json) {
  return '?' +
    Object.keys(json).map(function(key) {
      return encodeURIComponent(key) + '=' +
        encodeURIComponent(json[key]);
    }).join('&');
}

/** PRIOR VERSION **
exports.getUserInfo = function( userid ) {

    var slackRequest = http.request({
        'endpoint': 'Slack',
        'method': 'GET',
        'path': '/api/users.info?token=' + constants["Slack Token"] + '&user=' + encodeURIComponent( userid )
    });

    var slackResponse = slackRequest.write();
    var slackBody     = JSON.parse( slackResponse.body );
    if( !slackBody.ok ) {
        console.log( 'Error getting user "' + userid + '"' );
        return null;
    }

    return slackBody.user;

}
**/
