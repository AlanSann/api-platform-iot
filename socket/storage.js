const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

// Initialiser l'application Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://homewave-45d37.firebaseio.com",
});

async function getUser(uid) {
  try {
    const firestore = admin.firestore();
    const userRef = firestore.collection("users").doc(uid);

    const userSnapshot = await userRef.get();

    // Vérifier si le document existe dans Firestore
    if (userSnapshot.exists) {
      console.log("Utilisateur existant dans Firestore");
      const userData = userSnapshot.data();
      console.log(userData); // Log the retrieved data
      return userData;
    } else {
      console.log("Création en cours...");
      return await createUser(uid);
    }
  } catch (error) {
    console.error("Erreur lors de la récupération de l'utilisateur:", error);
    throw error;
  }
}

// Créer un utilisateur dans Firestore
async function createUser(uid) {
  try {
    const firestore = admin.firestore();
    const userRef = firestore.collection("users").doc(uid);

    const userData = {
      alarmState: true,
      system: [
        {
          type: "digicode",
          name: "codePin",
          value: "0000",
        },
      ],
      events: [
        {
          date: Date.now(),
          type: "event",
        },
      ],
    };

    await userRef.set(userData);
    return userData;
  } catch (error) {
    console.error("Erreur lors de la création de l'utilisateur:", error);
    throw error;
  }
}

module.exports = {
  getUser,
};
