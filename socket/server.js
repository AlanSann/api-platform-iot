const { getUser } = require("./storage");
const SerialPort = require("serialport");
const xbee_api = require("xbee-api");
var C = xbee_api.constants;
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
let valeurDIO3;
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

  if (C.FRAME_TYPE.ZIGBEE_IO_DATA_SAMPLE_RX === frame.type) {
    handleDIO3Value(frame);
  }


}

// Gestion des paquets Zigbee Receive
// Gestion des paquets Zigbee Receive
async function handleZigbeeReceivePacket(frame) {
  try {
    let dataReceived = frame.data.toString('utf-8').trim();  // Convert buffer to string and trim whitespace

    console.log(">> ZIGBEE_RECEIVE_PACKET >", dataReceived);

    switch (dataReceived) {
      case "MOTION_DETECTED":
        publishDataToTopic(client, "object", "Il y a quelqu'un !");
        if (user.alarmState) {
          console.log("Alarme activée");
          publishDataToTopic(client, "object", "Mouvement détecté !");
        }
        break;
      default:
        console.log("Code reçu :", dataReceived);
        // Vérifier le code PIN
        console.log("Avant checkPinCode");
        console.log(dataReceived);

        // Fetch the user data from Firestore
        user = await getUser(uid);

        const storedPinCode = user.pin;

        checkPinCode(dataReceived, storedPinCode);

        console.log("Après checkPinCode");

        publishDataToTopic(client, "object", "Mouvement détecté !");
        console.log("Code ");
        console.log(dataReceived);
        break;
    }
  } catch (error) {
    console.error("Erreur lors de la gestion de la réception Zigbee:", error);
  }
}

async function checkPinCode(pinCode, storedPinCode) {
  try {
    console.log("Début de la vérification du code PIN");

    const isPinCorrect = String(pinCode) === String(storedPinCode);

    console.log("Code PIN saisi :", pinCode);
    console.log("Code PIN stocké :", storedPinCode);

    if (isPinCorrect) {
      console.log("Le code PIN est correct. Désactivation du laser et du capteur.");
      sendCommandToArduinoXbee('STOP_MOTION_SENSORy');
      // Ajoutez ici le code pour désactiver le laser et le capteur
    } else {
      console.log("Le code PIN est incorrect. Aucune action effectuée.");
      // Aucune action à effectuer pour le cas où le code PIN est incorrect
    }

    return isPinCorrect;
  } catch (error) {
    console.error("Erreur lors de la vérification du code PIN:", error);
    return false;
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
      commandParameter: valeurAD1 >= 10 && valeurAD1 <= 70 ? [0x05] : [0x04],
    };

    console.log(
      valeurAD1 >= 20 && valeurAD1 <= 40
        ? "Rien à signaler !"
        : "Intrusion ! Lumière allumée !"
    );
    sendRemoteCommand(remoteCommand);
  }

}

// Gestion de la valeur D3
function handleDIO3Value(frame) {
  if (frame.digitalSamples && frame.digitalSamples.DIO3 !== undefined) {
    valeurDIO3 = frame.digitalSamples.DIO3;
    console.log("Valeur du capteur DIO3 (D3) :", valeurDIO3);
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

function sendCommandXbee(command, parameter) {
  const frame = {
    type: 0x17, // Type de trame de commande à distance (AT Remote Command Request)
    id: 0x01,   // ID de la trame (peut être n'importe quoi)
    destination64: '0013A20012345678', // Adresse 64 bits du module XBee distant
    command: command, // Commande à exécuter sur le module XBee distant
    commandParameter: parameter // Paramètre de la commande (peut être null)
  };

  serialport.write(xbeeAPI.buildFrame(frame));
}

// Exemple : envoyer la commande 'X10' avec le paramètre 'data' au module XBee distant
sendCommandXbee('X10', 'data');

// Exemple d'utilisation de la fonction getUser
user = getUser(uid);

function sendCommandToArduinoXbee(data) {
  const frame = {
    type: 0x10,
    destination64: "0013A20041A7133C",
    data: data,
  }

  serialport.write(xbeeAPI.buildFrame(frame));
  console.log("Commande envoyée à l'Arduino = " + data + "\n");
}

//sendCommandToArduinoXbee('STOP_MOTION_SENSORy');