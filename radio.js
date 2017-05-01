// The initial channel
var channel = "everything";
let playlistPoll;
let statusPoll;

function ajax_with_json(url, func) {
    let httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = function() {
        if(httpRequest.readyState === XMLHttpRequest.DONE && httpRequest.status === 200) {
            let response = JSON.parse(httpRequest.responseText);
            func(response);
        };
    };

    httpRequest.open("GET", url);
    httpRequest.send();
}

function populate_channel_list() {
    ajax_with_json("/radio/status-json.xsl", function(response) {
        // Get the list of channels, excluding "everything".
        let channels = [];
        for(id in response.icestats.source) {
            let source = response.icestats.source[id];
            let sname = source.server_name.substr(0, source.server_name.length - 6);
            if(source.server_name.endsWith(" (ogg)") && sname != "everything") {
                channels.push(sname);
            }
        }

        // Sort them.
        channels.sort();

        // Add to the selector drop-down.
        let dropdown = document.getElementById("channel");
        for(id in channels) {
            let channel = channels[id];
            dropdown.options[dropdown.options.length] = new Option(channel, channel);
        }
    });
}

function check_status() {
    ajax_with_json("/radio/status-json.xsl", function(response) {
        let listeners = 0;
        let listenersPeak = 0;
        let description = "";

        // Find the stats for the appropriate output.
        for(id in response.icestats.source) {
            let source = response.icestats.source[id];

            // Assume that the listeners of the ogg and mp3 streams
            // are disjoint and just add them.  Bigger numbers are
            // better, right?
            if(source.server_name.startsWith(channel + " (")) {
                listeners     += source.listeners;
                listenersPeak += source.listener_peak;
                description    = source.server_description;
            }
        }

        // Update the stats on the page.
        document.getElementById("listeners").innerText = "listeners: " + listeners + " (peak: " + listenersPeak + ")";

        // Update the channel description, in case it's changed.
        // document.getElementById("description").innerText = description;
    });
}

function check_playlist() {
    function format_track(track){
        return track.artist + " - " + track.title;
    }

    function add_track_to_tbody(tbody, track, acc, ago) {
        // Create row and cells
        let row   = tbody.insertRow(tbody.rows.length);
        let dcell = row.insertCell(0);
        let tcell = row.insertCell(ago ? 1 : 0);
        dcell.className = "dur";
        tcell.className = "track";

        // The track
        tcell.innerText = format_track(track);

        // The duration
        let time = "";
        if(acc < 60) {
            time = "under a min";
        } else {
            time = Math.round(acc / 60);
            time += " min" + ((time==1) ? "" : "s");
        }
        dcell.innerText = ago ? time + " ago" : "in " + time;

        // New accumulator
        return acc + parseFloat(track.time);
    }

    function swap_tbody(id, tbody) {
        let old = document.getElementById(id);
        old.parentNode.replaceChild(tbody, old);
        tbody.id = id;
    }

    ajax_with_json("/playlist/" + channel + ".json", function(response) {
        // Update the "last played"
        let new_lastplayed = document.createElement("tbody");
        let ago            = parseFloat(response.elapsed);
        for(i in response.before) {
            ago = add_track_to_tbody(new_lastplayed, response.before[i], ago, true);
        }
        swap_tbody("lastplayed_body", new_lastplayed);

        // Update the "now playing"
        document.getElementById("nowplaying").innerText = format_track(response.current);
        document.getElementById("nowalbum").innerText = response.current.album;

        // Update the "queue"
        let new_queue = document.createElement("tbody");
        let until     = parseFloat(response.current.time) - parseFloat(response.elapsed);
        for(i in response.after) {
            until = add_track_to_tbody(new_queue, response.after[i], until, false);
        }
        swap_tbody("queue_body", new_queue);

        LainPlayer.updateProgress({
            length: response.current.time,
            elapsed: response.elapsed
        });
    });
}

function change_channel(e) {
    channel = e.value;
    LainPlayer.changeChannel(channel);

    // Update the stream links.
    document.getElementById("ogglink").href = "/radio/" + channel + ".ogg.m3u";
    document.getElementById("mp3link").href = "/radio/" + channel + ".mp3.m3u";

    // Update the file list link.
    document.getElementById("fileslink").href = "/file-list/" + channel + ".html";

    // clear the running Intervals
    // this is needed for the smooth progressbar update to be in sync
    clearInterval(statusPoll);
    clearInterval(playlistPoll);

    // Update the status and playlist.
    // and reset the Intervals
    check_status();
    statusPoll = setInterval(check_status, 15000);
    check_playlist();
    playlistPoll = setInterval(check_playlist, 15000);
}

window.onload = () => {
    // Show and hide things
    let show = document.getElementsByClassName("withscript");
    let hide = document.getElementsByClassName("noscript");
    for(let i = 0; i < show.length; i++) { show[i].style.display = (show[i].tagName == "DIV" || show[i].tagName == "HEADER") ? "block" : "inline"; }
    for(let i = 0; i < hide.length; i++) { hide[i].style.display = "none"; }

    // Populate the channel list.
    populate_channel_list();

    // Get the initial status and set a timer to regularly update it.
    check_status();
    statusPoll = setInterval(check_status, 15000);

    // Get the initial playlist and set a timer to regularly update it.
    check_playlist();
    playlistPoll = setInterval(check_playlist, 15000);
}
