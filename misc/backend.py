#!/usr/bin/env python3

"""Backend Services.

Usage:
  backend.py [--http-dir=PATH] [--music-dir=PATH] [--mpd-host=HOST] PORT
  backend.py (-h | --help)

Options:
  --http-dir=PATH   Path of the web files   [default: /srv/http]
  --music-dir=PATH  Path of the music files [default: /srv/radio/music]
  --mpd-host=HOST   Hostname of MPD         [default: localhost]
  -h --help         Show this text

"""

from docopt import docopt
from flask import Flask, make_response, request, send_file
from mpd import MPDClient
import json, os, random, time

app  = Flask(__name__)
args = docopt(__doc__)


def in_http_dir(path):
    """Return a path in the HTTP directory."""

    return os.path.join(args["--http-dir"], path)


def in_music_dir(path):
    """Return a path in the msuic directory."""

    return os.path.join(args["--music-dir"], path)


def random_file_from(dname, cont=None):
    """Serve a random file from a directory."""

    files = [f for f in os.listdir(dname) if not f.startswith('.')]
    if not files:
        return send_file(in_http_dir("404.html")), 404

    fname = random.choice(files)
    if not cont:
        return send_file(os.path.join(dname, fname), cache_timeout = 0)

    return cont(fname)


def playlist_for(port, beforeNum=5, afterNum=5):
    """Return the playlist of the given MPD instance, as JSON."""

    try:
        client = MPDClient()
        client.connect(args["--mpd-host"], port)
    except:
        return "Could not connect to MPD.", 500

    status = client.status()
    song   = int(status["song"])
    pllen  = int(status["playlistlength"])

    songsIn  = lambda fromPos, toPos: client.playlistinfo("{}:{}".format(max(0, min(pllen, fromPos)), max(0, min(pllen, toPos))))
    sanitise = lambda song: {t: song[t] for t in ["artist", "albumartist", "album", "track", "time", "date", "title"] if t in song}
    pinfo    = {
        "before":  list(map(sanitise, songsIn(song-beforeNum, song))),
        "current": list(map(sanitise, client.playlistinfo(song)))[0],
        "after":   list(map(sanitise, songsIn(song+1, song+afterNum+1))),
        "elapsed": status["elapsed"]
    }
    pinfo["before"].reverse()

    resp = make_response(json.dumps(pinfo), 200)
    resp.headers["Content-Type"] = "application/json"
    return resp


@app.route("/background", methods=["GET"])
def background():
    return random_file_from(in_http_dir("backgrounds"))


@app.route("/transition.mp3", methods=["GET"])
def transition():
    return random_file_from(in_music_dir("transitions"))


@app.route("/upload/bump", methods=["POST"])
def upload_bump():
    fname = str(time.time())

    if "file" in request.files:
        f = request.files["file"]
        if f and f.filename:
            f.save(os.path.join(in_http_dir("upload"), fname + "-file"))

    if "url" in request.form:
        u = request.form["url"]
        if u:
            with open(os.path.join(in_http_dir("upload"), fname + "-url"), "w") as f:
                f.write(u)

    return send_file(in_http_dir("thankyou.html"))


@app.route("/playlist/<channel>.json", methods=["GET"])
def playlist(channel):
    # TODO: have some way of figuring this out automatically.  Check
    # systemd unit names?  Feels hacky...
    if channel == "everything":
        return playlist_for(6600)
    elif channel == "cyberia":
        return playlist_for(6601)
    elif channel == "swing":
        return playlist_for(6602)

    return send_file(in_http_dir("404.html")), 404


@app.route("/webm.html", methods=["GET"])
def webm():
    tpl= '''
<!DOCTYPE html>
<html>
  <head>
    <title>{0}</title>
    <meta charset="UTF-8">
    <link rel="stylesheet" type="text/css" href="/webm.css">
  </head>
  <body>
    <a href="/webms/{1}">
      <video autoplay loop src="/webms/{1}">
        Your browser does not support HTML5 video.
      </video>
    </a>
  </body>
</html>
        '''
    return random_file_from(in_http_dir("webms"), lambda webm: tpl.format(webm[:-5], webm))


@app.errorhandler(404)
def page_not_found(error):
    return send_file(in_http_dir("404.html"))


if __name__ == "__main__":
    try:
        try:
            args["PORT"] = int(args["PORT"])
        except:
            raise Exception("PORT must be an integer between 1 and 65535")
        if args["PORT"] < 1 or args["PORT"] > 65535:
            raise Exception("PORT must be an integer between 1 and 65535")
        if not os.path.isdir(args["--http-dir"]):
            raise Exception("--http-dir must be a directory")
        if not os.path.isdir(args["--music-dir"]):
            raise Exception("--music-dir must be a directory")
    except Exception as e:
        print(e.args[0])
        exit(1)

    try:
        app.run(port=args["PORT"])
    except:
        print("could not bind to port")
        exit(2)
