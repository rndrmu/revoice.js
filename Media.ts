

import { MediaStreamTrack } from "msc-node";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import YTDlpWrap from "./node_modules/yt-dlp-wrap/dist/index";
import { createSocket, Socket } from "dgram";
import { ChildProcess, ChildProcessWithoutNullStreams, exec } from "node:child_process";


class Media {
  track: MediaStreamTrack | null;
  socket: Socket;
  emitter: EventEmitter;
  port: number;
  logs: boolean;
  playing: boolean;
  // function returning a process handle
  ffmpeg: ChildProcess;

  constructor(logs=false, port=5030) {
    this.track = new MediaStreamTrack({ kind: "audio" });
    this.socket = createSocket("udp4");
    this.socket.bind(port);
    this.socket.addListener("message", (data, rinfo) => {
      this.logs ? console.log(`Received ${data.length} bytes from ${rinfo.address}:${rinfo.port}`) : null;
      this.track?.writeRtp(data);
    });
    this.emitter = new EventEmitter();
    

    this.port = port;
    this.logs = logs;
    this.playing = false;
    this.ffmpeg = this.spawnFFmpeg();
    
    
   /*  if (logs) {
      this.ffmpeg.stdout.on("data", (data) => {
        console.log(Buffer.from(data).toString());
      })
      this.ffmpeg.stderr.on("data", (data) => {
        console.log(Buffer.from(data).toString());
      });
    }

    this.ffmpeg.on("close", (code) => {
      if (code == 0) {
        this.emitter.emit("finish");
        this.emitter.emit("end");
        console.log("FFmpeg exited with code 0 - Constructor");
      } 
    }) */

    return this;
  }

  on(event, cb) {
   return this.emitter.on(event, cb);
  }
  once(event, cb) {
    return this.emitter.once(event, cb);
  }
  emit(event, data) {
    return this.emitter.emit(event, data);
  }

  spawnFFmpeg(input?, port = 5030): ChildProcess {
    this.playing = true;
    const ffmpeg_proc = exec("ffmpeg " + this.createFfmpegArgs("00:00:00", input).join(" "), (err, stdout, stderr) => {
      if (err) {
        this.logs ? console.log(err) : null;
        return;
      }
    })
    .on("close", (code) => {
      if (code == 0) {
        this.emitter.emit("finish");
        this.emitter.emit("end");
        console.log("FFmpeg exited with code 0 - spawnFFmpeg");
      }
    })
    .on("error", (err) => {
      console.log(err);
    })
    return ffmpeg_proc;
    // after the transcoding is done, set the playing flag to false
  } 

  createFfmpegArgs(start="00:00:00", input) {
    return ["-re", "-i", input, "-ss", start, "-map", "0:a", "-b:a", "48k", "-maxrate", "48k", "-c:a", "libopus", "-f", "rtp", "rtp://127.0.0.1:" + this.port]
  }
  getMediaTrack() {
    return this.track;
  }
  playFile(path) {
    if (!path) throw "You must specify a file to play!";
    this.spawnFFmpeg(path);
  }
 /*  writeStreamChunk(chunk) {
    if (!chunk) throw "You must pass a chunk to be written into the stream";
    this.ffmpeg.stdin.write(chunk);
  } */
  playStream(stream) {
    if (!stream) throw "You must specify a stream to play!";
    this.spawnFFmpeg(stream);
  }

  async getYouTubeStream(url) {
    const ytdlp = new YTDlpWrap("yt-dlp");
    const metadata = await ytdlp.getVideoInfo(url)
    return metadata.url
  }

  async playYTStream(url) {
    if (!url) throw "You must specify a youtube stream to play!";
    if (!this.track) this.track = new MediaStreamTrack({ kind: "audio" });

    this.spawnFFmpeg(await this.getYouTubeStream(url));
  }
}



class MediaPlayer {

  media: Media;
  paused: boolean;
  emitter: EventEmitter;
  currTime: string | null;
  streamFinished: boolean;
  finishTimeout: NodeJS.Timeout | null;
  currBuffer: Buffer | null;
  logs: boolean;
  originStream: fs.ReadStream | null;
  playing:  boolean;

  constructor(logs=false, port=5030) {
    this.media = new Media(logs, port);

    this.emitter = new EventEmitter();
    this.originStream = null;
    this.playing = false;
    this.paused = false;
    this.currTime = null;
    this.streamFinished = false;
    this.finishTimeout = null;
    // resizeable array buffer
    this.currBuffer = Buffer.alloc(0);
    this.logs = logs;

    return this;
  }
  on(event, cb) {
    return this.emitter.on(event, cb);
  }
  once(event, cb) {
    return this.emitter.once(event, cb);
  }
  emit(event, data?) {
    return this.emitter.emit(event, data);
  }

  static timestampToSeconds(timestamp="00:00:00", ceilMinutes=false) {
    //@ts-ignore
    timestamp = timestamp.split(":").map((el, index) => {
      if (index < 2) {
        return parseInt(el);
      } else {
        return ((ceilMinutes) ? Math.ceil(parseFloat(el)) : parseFloat(el));
      }
    });
    const hours = timestamp[0];
    const minutes = timestamp[1];
    const currSeconds = timestamp[2];
    //@ts-ignore
    return (hours * 60 * 60) + (minutes * 60) + currSeconds; // convert everything to seconds
  }

  disconnect(destroy=true) { // this should be called on leave
    if (destroy) this.media.track = null; // clean up the current data and streams
    //this.originStream.destroy();
    this.paused = false;
    this.media.ffmpeg.kill();
    this.currBuffer = null;
    this.streamFinished = true;
    this.currTime = "00:00:00";

    //this.media.ffmpeg = this.setupFmpeg();
  }
  cleanUp() { // TODO: similar to disconnect() but doesn't kill existing processes
    this.paused = false;
    this.currBuffer = null;
    this.currTime = "00:00:00";
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.media.ffmpeg.kill();
  }
  resume() {
    if (!this.paused) return;

    this.media.spawnFFmpeg();
    //this.media.writeStreamChunk(this.currBuffer);
    this.paused = false;
  }
  stop() { // basically the same as process on disconnect
    this.disconnect(false);
    this.emit("finish");
  }
  gettrack() {
    if (!this.media.track) this.media.track = new MediaStreamTrack({ kind: "audio" });
    this.media.getMediaTrack();
  }

  async getYouTubeStream(url) {
    const ytdlp = new YTDlpWrap("yt-dlp");
    const metadata = await ytdlp.getVideoInfo(url)
    return metadata.url
  }

  async playYTStream(url) {
    if (!url) throw "You must specify a youtube stream to play!";
    if (!this.media.track) this.media.track = new MediaStreamTrack({ kind: "audio" });
    const streamableUrl = await this.getYouTubeStream(url);
    console.log(streamableUrl);
    // enclose the url in quotes to prevent errors
    const url_quoted = `"${streamableUrl}"`;
    this.media.spawnFFmpeg(url_quoted);
  }

  playStream(stream) {
    //if (!this.media.track) this.media.track = new MediaStreamTrack({ kind: "audio" });

    this.originStream = stream;
    this.currBuffer = Buffer.alloc(0);
    this.playing = true;
    this.streamFinished = false;

    this.emit("start");
    console.log("Starting stream");


    // ffmpeg stuff
    //this.setupFmpeg();
    this.media.spawnFFmpeg(stream);

    console.log("Stream ended");
    this.media.playing = false;
    this.emit("end");
  }
  
  playFile(path) {
    return this.playStream(path);
  }
}

export { MediaPlayer, Media };

