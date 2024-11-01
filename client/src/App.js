import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import Draggable from 'react-draggable';
import { IoMdMic, IoMdMicOff } from "react-icons/io";
import { BiSolidVideo, BiSolidVideoOff } from "react-icons/bi";
import { BsRecord2 } from "react-icons/bs";
import { LuScreenShare } from "react-icons/lu";

const socket = io("http://localhost:5000");

const App = () => {
  const mediaRecorderRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const peerConnectionRef = useRef(null);
  const [isJoined, setIsJoined] = useState(false);
  const [roomID, setRoomID] = useState("");
  const [isAudio, setIsAudio] = useState(true);
  const [isVideo, setIsVideo] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [other, setOther] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [audioStream, setAudioStream] = useState(null);
  const [videoStream, setVideoStream] = useState(null);
  const [combine, setcombine] = useState(null);


  const MicToggle = async () => {
    if (isAudio) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream);
      stream.getTracks().forEach((track) => {
        if (track.kind === 'audio') {
          peerConnectionRef.current.addTrack(track, stream); // Add audio track to peer connection
        }
      });
      socket.emit("audio-on", { roomID, userId: socket.id });
      setIsAudio(false);
    } else {

      if (audioStream) {
        audioStream.getTracks().forEach((track) => {
          if (track.kind === 'audio') {
            track.stop(); // Stop capturing from the microphone device
            peerConnectionRef.current.getSenders().forEach((sender) => {
              if (sender.track === track) {
                peerConnectionRef.current.removeTrack(sender); // Remove the track from peer connection
              }
            });
          }
        });
        setAudioStream(null);
        socket.emit("audio-off", { roomID, userId: socket.id });
        setIsAudio(true);


      }
    }
  }


  const VideoToggle = async () => {
    if (!isVideo) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setVideoStream(stream);
      localVideoRef.current.srcObject = stream;
      stream.getTracks().forEach((track) => {
        if (track.kind === 'video') {
          peerConnectionRef.current.addTrack(track, stream);
        }
      });
      socket.emit("video-on", { roomID, userId: socket.id });
      setIsVideo(true);
    } else {
      setVideoStream((videoStream) => {
        if (videoStream) {
          videoStream.getTracks().forEach((track) => track.stop());
        }
        return null;
      });



      localVideoRef.current.srcObject = null;
      socket.emit("video-off", { roomID, userId: socket.id });
      setIsVideo(false);
    }
  };


  const screenStreamRef = useRef(null);

  
  async function toggleScreenShare(peerConnection) {
    try {
      const videoSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      const isScreenShareActive = videoSender && videoSender.track.label.includes("Screen");
  
      if (isScreenShareActive) {
        await revertToWebcam(peerConnection, videoSender);
      } else {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
  
        if (videoSender) {
          videoSender.replaceTrack(screenTrack);
        }
  
        screenTrack.onended = () => revertToWebcam(peerConnection, videoSender);
        
        console.log("Screen sharing started.");
      }
    } catch (error) {
      console.error("Error toggling screen sharing:", error);
    }
  }
  
  async function revertToWebcam(peerConnection, videoSender) {
    try {
      const webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const webcamTrack = webcamStream.getVideoTracks()[0];
      
      if (videoSender) {
        videoSender.replaceTrack(webcamTrack);
      }
  
      console.log("Reverted to webcam video.");
    } catch (error) {
      console.error("Error reverting to webcam:", error);
    }
  }
  



  const startRecording = async () => {

    console.log("start recording");


    console.log("Starting recording...");

    if (!localVideoRef.current?.srcObject || !remoteVideoRef.current?.srcObject) {
      console.error("One or both video streams are missing");
      return;
    }


    const canvas = document.createElement("canvas");
    const videoWidth = 640;
    const videoHeight = 480;
    canvas.width = videoWidth * 2; 
    canvas.height = videoHeight;

    const context = canvas.getContext("2d");

    const drawFrame = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(localVideoRef.current, 0, 0, videoWidth, videoHeight); 
      context.drawImage(remoteVideoRef.current, videoWidth, 0, videoWidth, videoHeight); 
      requestAnimationFrame(drawFrame);
    };
    drawFrame();

    const combinedStream = canvas.captureStream(30); 

    localVideoRef.current.srcObject.getAudioTracks().forEach(track => combinedStream.addTrack(track));
    remoteVideoRef.current.srcObject.getAudioTracks().forEach(track => combinedStream.addTrack(track));

    const handleDataAvailable = (event) => {
      if (event.data.size > 0) {
        setRecordedChunks((prev) => [...prev, event.data]);
      }
    };

    mediaRecorderRef.current = new MediaRecorder(combinedStream, { mimeType: "video/webm" });
    mediaRecorderRef.current.ondataavailable = handleDataAvailable;
    mediaRecorderRef.current.start();

    setIsRecording(true);
    console.log("Recording started");
  }

  const stopRecording = () => {
    console.log("Stopped recording");

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop(); 
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          const newChunks = [...recordedChunks, event.data];
          const recordedBlob = new Blob(newChunks, { type: "video/webm" });
          const url = URL.createObjectURL(recordedBlob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "recording.webm"; 
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a); 
        }
      };
      setRecordedChunks([]); 
      setIsRecording(false);
    } else {
      console.error("Error: MediaRecorder is not initialized");
    }
  };



  useEffect(() => {


    const initializePeerConnection = async () => {
      peerConnectionRef.current = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", { candidate: event.candidate, roomID });
        }
      };

      peerConnectionRef.current.ontrack = (event) => {
        remoteVideoRef.current.srcObject = event.streams[0];
      };

      socket.on("user-joined", async () => {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        console.log(offer);
        socket.emit("offer", { sdp: offer, roomID });
      });

      socket.on("offer", async (offer) => {
        await peerConnectionRef.current.setRemoteDescription(offer);
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit("answer", { sdp: answer, roomID });
      });

      socket.on("answer", (answer) => {
        peerConnectionRef.current.setRemoteDescription(answer);
      });

      socket.on("ice-candidate", (candidate) => {
        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      });

      socket.on("room-full", () => {
        alert("Room is full. Please try a different room.");
      });

      socket.on("user-left", () => {
        remoteVideoRef.current.srcObject = null;
      });

      socket.on("audio-on", ({ userId }) => {
        const remoteStream = new MediaStream();
        peerConnectionRef.current.getReceivers().forEach(receiver => {
          if (receiver.track.kind === "audio") {
            remoteStream.addTrack(receiver.track);
          }
        });
        remoteVideoRef.current.srcObject = remoteStream;
      });

      socket.on("audio-off", ({ userId }) => {
        if (userId !== socket.id && remoteVideoRef.current.srcObject) {
          remoteVideoRef.current.srcObject.getAudioTracks().forEach((track) => track.stop());
          remoteVideoRef.current.srcObject = null;
        }
      });




      socket.on("video-off", ({ userId }) => {
        if (userId !== socket.id) {
          remoteVideoRef.current.srcObject = null; 
        }
      });

      socket.on("video-on", async ({ userId }) => {
        if (userId !== socket.id) {
          const remoteStream = new MediaStream();
          peerConnectionRef.current.getReceivers().forEach(receiver => {
            if (receiver.track.kind === "video") {
              remoteStream.addTrack(receiver.track);
            }
          });
          remoteVideoRef.current.srcObject = remoteStream; 
        }
      });

      socket.on("screen-share", async (userId) => {
        const remoteStream = new MediaStream();

        const remoteVideo = remoteVideoRef.current;

        const remoteTracks = peerConnectionRef.current.getRemoteStreams();

        if (remoteTracks.length > 0) {
          const existingStream = remoteTracks[0];

          existingStream.getVideoTracks().forEach((track) => {
            remoteStream.addTrack(track);
            remoteVideo.srcObject = remoteStream;
          });
        }

        const localStream = localVideoRef.current.srcObject;

        if (localStream) {
          localStream.getTracks().forEach((track) => {
            remoteStream.addTrack(track);
          });
        }

        remoteVideo.srcObject = remoteStream;
      });

    };

    initializePeerConnection();


    return () => {
      socket.off("user-joined");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("room-full");
      socket.off("user-left");
      socket.off("screen-share");
      socket.off("video-off");
      socket.off("video-on");
    };
  }, [roomID]);

  const joinRoom = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideoRef.current.srcObject = stream;
      stream.getTracks().forEach((track) => {
        peerConnectionRef.current.addTrack(track, stream);
      });
      socket.emit("join-room", roomID);
      setIsJoined(true);
    } catch (error) {
      console.error("Error accessing media devices.", error);
    }
  };

  const leaveRoom = () => {
    peerConnectionRef.current.close();
    setIsJoined(false);
    socket.disconnect();
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h2>WebRTC Meet App with Room</h2>
      <input
        type="text"
        placeholder="Enter room ID"
        value={roomID}
        onChange={(e) => setRoomID(e.target.value)}
      />
      <br />
      <Draggable>
        <div className="w-[420px] p-4 border-2 border-black rounded-md bg-gray-100">
          {isRecording && (
            <div className="flex align-middle place-content-start rounded-lg right-0 my-5">
              <div className="flex p-3 bg-black text-white rounded-lg">
                <BsRecord2 size={24} color="red" /> Recording...
              </div>
            </div>
          )}
          <div className="mb-3">
            <video ref={localVideoRef} autoPlay playsInline className="w-[400px] border-2 border-black rounded-xl" />
          </div>
          {other && (
            <div>
              <video ref={remoteVideoRef} autoPlay playsInline className="w-[400px]" />
            </div>
          )}
          <div className="flex justify-between align-middle">
            <button className="flex align-center place-content-center bg-slate-400 p-4 rounded-full" onClick={MicToggle}>
              {isAudio ? <IoMdMic size={44} /> : <IoMdMicOff size={44} />}
            </button>
            <button className="flex align-center place-content-center bg-slate-400 p-4 rounded-full" onClick={VideoToggle}>
              {isVideo ? <BiSolidVideo size={44} /> : <BiSolidVideoOff size={44} />}
            </button>
            <button className="flex align-center place-content-center bg-slate-400 p-4 rounded-full" onClick={isRecording ? stopRecording : startRecording}>
              <BsRecord2 size={44} />
            </button>
            <button className="flex align-center place-content-center bg-slate-400 p-4 rounded-full" onClick={toggleScreenShare}>
              <LuScreenShare size={44} />
            </button>
          </div>
        </div>
      </Draggable>
      {isJoined ? (
        <button onClick={leaveRoom}>Leave Room</button>
      ) : (
        <button onClick={joinRoom} disabled={!roomID}>Join Room</button>
      )}
    </div>
  );
}

export default App;
