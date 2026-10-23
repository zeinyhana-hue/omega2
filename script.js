import { GoogleGenAI, Modality } from
  "https://esm.sh/@google/genai";

const micButton = document.getElementById("micButton");
const statusText = document.getElementById("status");
const description = document.getElementById("description");
const userText = document.getElementById("userText");
const aiText = document.getElementById("aiText");
const errorMessage = document.getElementById("errorMessage");

let session = null;
let audioStream = null;
let audioContext = null;
let processor = null;
let source = null;
let nextPlayTime = 0;
let isConnecting = false;

function showError(message) {
  errorMessage.textContent = message;
}

function floatTo16BitPCM(float32Array) {
  const int16Array = new Int16Array(float32Array.length);

  for (let i = 0; i < float32Array.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = sample < 0
      ? sample * 32768
      : sample * 32767;
  }

  return int16Array;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

function base64ToInt16(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Int16Array(
    bytes.buffer,
    bytes.byteOffset,
    Math.floor(bytes.byteLength / 2)
  );
}

async function startConversation() {
  if (isConnecting || session) return;

  isConnecting = true;
  micButton.disabled = true;
  showError("");
  statusText.textContent = "Connecting...";
  description.textContent = "Please allow microphone access.";

  try {
    const response = await fetch("/api/token");

    if (!response.ok) {
      throw new Error("Couldn't create a Gemini session.");
    }

    const { token } = await response.json();

    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    audioContext = new AudioContext({ sampleRate: 24000 });

    const ai = new GoogleGenAI({
      apiKey: token,
      httpOptions: {
        apiVersion: "v1alpha"
      }
    });

    session = await ai.live.connect({
      model: "gemini-2.5-flash-native-audio-preview-12-2025",
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: `
You are OMEGA, a warm, friendly companion for children and older adults.

Speak in natural Egyptian Arabic.
Be kind, patient, and conversational.
Ask one question at a time.
Help the user recall people, places, and meaningful life events.
Never invent memories or pressure the user.
This is a prototype, so you do not have access to a real memory bank.
Start by warmly greeting the user and asking how they are feeling today.
        `
      },
      callbacks: {
        onopen: () => {
          statusText.textContent = "Listening...";
          description.textContent = "Talk naturally. I'm here with you.";
          micButton.disabled = false;
          micButton.classList.add("active");

          source = audioContext.createMediaStreamSource(audioStream);

          processor = audioContext.createScriptProcessor(4096, 1, 1);

          processor.onaudioprocess = (event) => {
            if (!session) return;

            const input = event.inputBuffer.getChannelData(0);
            const pcm = floatTo16BitPCM(input);

            session.sendRealtimeInput({
              audio: {
                data: arrayBufferToBase64(pcm.buffer),
                mimeType: "audio/pcm;rate=24000"
              }
            });
          };

          source.connect(processor);
          processor.connect(audioContext.destination);
        },

        onmessage: async (message) => {
          const serverContent = message.serverContent;

          if (!serverContent) return;

          if (serverContent.inputTranscription?.text) {
            userText.textContent =
              "You: " + serverContent.inputTranscription.text;
          }

          if (serverContent.outputTranscription?.text) {
            aiText.textContent =
              "OMEGA: " + serverContent.outputTranscription.text;
          }

          const parts = serverContent.modelTurn?.parts || [];

          for (const part of parts) {
            if (part.inlineData?.data) {
              const pcm = base64ToInt16(part.inlineData.data);
              const audioBuffer = audioContext.createBuffer(
                1,
                pcm.length,
                24000
              );

              const channel = audioBuffer.getChannelData(0);

              for (let i = 0; i < pcm.length; i++) {
                channel[i] = pcm[i] / 32768;
              }

              const player = audioContext.createBufferSource();
              player.buffer = audioBuffer;
              player.connect(audioContext.destination);

              const startAt = Math.max(
                audioContext.currentTime,
                nextPlayTime
              );

              player.start(startAt);
              nextPlayTime = startAt + audioBuffer.duration;
            }
          }

          if (serverContent.interrupted) {
            nextPlayTime = audioContext.currentTime;
          }
        },

        onerror: (event) => {
          showError("Gemini connection error. Check the terminal.");
          console.error("Gemini error:", event);
        },

        onclose: () => {
          statusText.textContent = "Disconnected";
        }
      }
    });

  } catch (error) {
    console.error(error);
    showError(error.message || "Something went wrong.");
    await stopConversation();
  } finally {
    isConnecting = false;
    micButton.disabled = false;
  }
}

async function stopConversation() {
  const oldSession = session;
  session = null;

  if (oldSession) {
    try {
      oldSession.close();
    } catch (error) {
      console.warn(error);
    }
  }

  if (processor) {
    processor.disconnect();
    processor.onaudioprocess = null;
    processor = null;
  }

  if (source) {
    source.disconnect();
    source = null;
  }

  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }

  if (audioContext) {
    await audioContext.close().catch(() => {});
    audioContext = null;
  }

  nextPlayTime = 0;
  micButton.classList.remove("active");
  statusText.textContent = "Ready to talk?";
  description.textContent = "Press the microphone button to start again.";
}

micButton.addEventListener("click", async () => {
  if (session || isConnecting) {
    await stopConversation();
  } else {
    await startConversation();
  }
});
