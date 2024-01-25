const { getUser } = require("./storage");
const SerialPort = require("serialport");
const xbee_api = require("xbee-api");
const mqtt = require("mqtt");
const dotenv = require("dotenv");

dotenv.config();

// Configuration MQTT
const brokerUrl = "mqtt://mqtt-dashboard.com";
const clientName = "mqtt-node-client";
const options = {
  clientId: clientName,
};
const client = mqtt.connect(brokerUrl, options);

// Configuration XBee
const SERIAL_PORT = process.env.SERIAL_PORT;
const xbeeAPI = new xbee_api.XBeeAPI({ api_mode: 2 });
const serialport = new SerialPort(
  SERIAL_PORT,
  {
    baudRate: parseInt(process.env.SERIAL_BAUDRATE) || 9600,
  },
  handleSerialPortError
);

// Variables globales
let valeurAD1;
let dataReceived;
let user;
const uid = "dru7DyoWEkTX17twZP9f49O18ED3";
let movedDetected = false;

// Fonction pour gérer les erreurs du port série
function handleSerialPortError(err) {
  if (err) {
    console.log("Error: ", err.message);
  }
}

// Fonction pour envoyer une commande à distance
function sendRemoteCommand(command) {
  try {
    const frame = xbeeAPI.buildFrame(command);
    serialport.write(frame);
  } catch (error) {
    console.error("Erreur lors de la construction de la trame XBee :", error);
  }
}

// Gestion des événements sur le port série
serialport.pipe(xbeeAPI.parser);
xbeeAPI.builder.pipe(serialport);

serialport.on("open", function () {
  // Initialisation des trames XBee
  const frameObj1 = {
    type: C.FRAME_TYPE.AT_COMMAND,
    command: "NI",
    commandParameter: [],
  };
  xbeeAPI.builder.write(frameObj1);

  const frameObj2 = {
    type: C.FRAME_TYPE.REMOTE_AT_COMMAND_REQUEST,
    destination64: "FFFFFFFFFFFFFFFF",
    command: "NI",
    commandParameter: [],
  };
  xbeeAPI.builder.write(frameObj2);

  // Récupération des infos du capteur photon (mettre adc)
  xbeeAPI.parser.on("data", handleXBeeData);
});

// Gestion des données XBee
function handleXBeeData(frame) {
  if (C.FRAME_TYPE.ZIGBEE_RECEIVE_PACKET === frame.type) {
    handleZigbeeReceivePacket(frame);
  }

  if (C.FRAME_TYPE.NODE_IDENTIFICATION === frame.type) {
    console.log("NODE_IDENTIFICATION");
  } else if (C.FRAME_TYPE.ZIGBEE_IO_DATA_SAMPLE_RX === frame.type) {
    console.log("ZIGBEE_IO_DATA_SAMPLE_RX");
    console.log(frame.analogSamples.AD0);
  } else if (C.FRAME_TYPE.REMOTE_COMMAND_RESPONSE === frame.type) {
    // console.log("REMOTE_COMMAND_RESPONSE")
  } else {
    console.debug(frame);
    let dataReceived = String.fromCharCode.apply(null, frame.commandData);
    // console.log(dataReceived);
  }

  if (C.FRAME_TYPE.ZIGBEE_IO_DATA_SAMPLE_RX === frame.type) {
    handleAD1Value(frame);
  }
}

// Gestion des paquets Zigbee Receive
function handleZigbeeReceivePacket(frame) {
  let dataReceived = "";
  for (let i = 0; i < frame.data.length; i++) {
    dataReceived += String.fromCharCode(frame.data[i]);
  }
  dataReceived = dataReceived.trim();
  console.log(">> ZIGBEE_RECEIVE_PACKET >", dataReceived);

  switch (dataReceived) {
    case "MOTION_DETECTED":
      if (user.alarmState) {
        console.log("Alarme activée");
        movedDetected = true;
        publishDataToTopic(client, "object", "Mouvement détecté !");
      }
      break;
    default:
      if (user.alarmState && movedDetected) {
        console.log("Code reçu :", dataReceived);
        movedDetected = true;
        publishDataToTopic(client, "object", "Mouvement détecté !");
      }
      console.log("Code ");
      console.log(dataReceived);
  }
}

// Gestion de la valeur AD1
function handleAD1Value(frame) {
  if (frame.analogSamples && frame.analogSamples.AD1 !== undefined) {
    valeurAD1 = frame.analogSamples.AD1;
    console.log("Valeur du capteur AD1 (D1) :", valeurAD1);

    const remoteCommand = {
      type: C.FRAME_TYPE.REMOTE_AT_COMMAND_REQUEST,
      destination64: "FFFFFFFFFFFFFFFF",
      command: "D0",
      commandParameter: valeurAD1 >= 40 && valeurAD1 <= 50 ? [0x05] : [0x04],
    };

    console.log(
      valeurAD1 >= 40 && valeurAD1 <= 50
        ? "Rien à signaler !"
        : "Intrusion ! Lumière allumée !"
    );
    sendRemoteCommand(remoteCommand);
  }
}

// Gestion des événements MQTT
client.on("connect", handleMQTTConnect);
client.on("message", handleMQTTMessage);
client.on("close", () => console.log("Déconnecté du serveur MQTT"));
client.on("error", (err) => console.error("Erreur MQTT:", err));

// Fonction pour gérer la connexion MQTT
function handleMQTTConnect() {
  console.log("Connecté au serveur MQTT");
  client.subscribe("object", (err) => {
    if (!err) {
      console.log('Abonné au sujet (topic) "object"');
    }
    setInterval(() => {
      console.log(user);
      if (dataReceived !== undefined) {
        // publishDataToTopic(client, 'object', dataReceived);
      } else {
        console.log("Pas de valeur du digicode");
        // publishDataToTopic(client, "object", "Pas de valeur du digicode");
      }
    }, 7000);
  });
}

// Fonction pour gérer les messages MQTT
function handleMQTTMessage(topic, message) {
  console.log(
    `Message reçu du sujet (topic) "${topic}": ${message.toString()}`
  );
}

// Fonction pour publier des données sur un sujet MQTT
function publishDataToTopic(client, topic, message) {
  client.publish(topic, message, (err) => {
    if (err) {
      console.error("Erreur lors de la publication du message:", err);
    } else {
      console.log(`Message publié sur le sujet "${topic}": ${message}`);
    }
  });
}

// Exemple d'utilisation de la fonction getUser
user = getUser(uid);
