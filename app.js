const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const { google } = require("googleapis");
const Swal = require("sweetalert2");
require("dotenv").config();
const apikeys = require("./apikeys.json"); // Load API keys from apikeys.json

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"))); // Assuming your index.html and app.js are in the public directory

const upload = multer({ dest: "uploads/" });

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post(
  "/submit-form",
  upload.fields([
    { name: "mandatoryFile", maxCount: 1 },
    { name: "optionalFile1", maxCount: 1 },
    { name: "optionalFile2", maxCount: 1 },
    { name: "optionalFile3", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      let driveUploadPromises = []; // Array to hold all file upload promises

      // Function to handle file upload to Google Drive
      const handleFileUpload = async (fieldName) => {
        if (req.files && req.files[fieldName] && req.files[fieldName][0]) {
          const file = req.files[fieldName][0];
          const authClient = await authorize();

          // Example: Generate a unique filename based on file type, name, and phone number
          const nameFromForm = req.body.Name; // Assuming 'name' is a field in your form
          const phoneFromForm = req.body.Phone; // Assuming 'phone' is a field in your form

          let fileType = "";
          let fileIndex = "";

          switch (fieldName) {
            case "mandatoryFile":
              fileType = "ProfilePhoto";
              fileIndex = "Profile";
              break;
            case "optionalFile1":
              fileType = "Project-1";
              fileIndex = "Project1";
              break;
            case "optionalFile2":
              fileType = "Project-2";
              fileIndex = "Project2";
              break;
            case "optionalFile3":
              fileType = "Project-3";
              fileIndex = "Project3";
              break;
            default:
              fileType = "Unknown";
          }

          // Extract file extension from original filename
          const originalFilename = file.originalname;
          const fileExtension = path.extname(originalFilename);

          // Generate a unique filename based on type, name, phone number, and original extension
          const uniqueFilename = `${fileIndex}_${nameFromForm}_${phoneFromForm}${fileExtension}`;

          const fileMetadata = {
            name: uniqueFilename, // Use unique filename for Google Drive
            parents: [process.env.Parents], // Replace with your folder ID
          };

          const media = {
            mimeType: file.mimetype,
            body: fs.createReadStream(file.path),
          };

          const drive = google.drive({ version: "v3", auth: authClient });

          const driveUploadPromise = new Promise((resolve, reject) => {
            drive.files.create(
              {
                resource: fileMetadata,
                media: media,
                fields: "id",
              },
              (err, uploadedFile) => {
                if (err) {
                  console.error(`Error uploading ${fieldName}:`, err);
                  reject(`Error uploading ${fieldName} to Google Drive.`);
                } else {
                  console.log(
                    `${fieldName} uploaded successfully:`,
                    uploadedFile.data
                  );
                  fs.unlinkSync(file.path); // Delete the uploaded file from local storage
                  resolve(uploadedFile.data); // Resolve with uploaded file data
                }
              }
            );
          });

          driveUploadPromises.push(driveUploadPromise);
          return driveUploadPromise; // Return promise for chaining
        }
      };

      // Handle mandatory file upload
      const mandatoryFilePromise = handleFileUpload("mandatoryFile");

      // Handle optional file uploads
      const optionalFile1Promise = handleFileUpload("optionalFile1");
      const optionalFile2Promise = handleFileUpload("optionalFile2");
      const optionalFile3Promise = handleFileUpload("optionalFile3");

      // Wait for all file upload promises to resolve
      await Promise.all([
        mandatoryFilePromise,
        optionalFile1Promise,
        optionalFile2Promise,
        optionalFile3Promise,
      ]);

      // Now handle form submission (assuming AJAX request is made to /submit-form)
      const scriptURL = process.env.Google_Script_URL;
      const formData = new FormData();

      Object.keys(req.body).forEach((key) => {
        formData.append(key, req.body[key]);
      });

      Swal.fire({
        title: "Please wait...",
        allowOutsideClick: false,
        onBeforeOpen: () => {
          Swal.showLoading();
        },
      });

      axios
        .post(scriptURL, formData, {
          headers: {
            "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
          },
        })
        .then((response) => {
          console.log("Response:", response.data);
          Swal.close();
          res.redirect("/Success.html");
        })
        .catch((error) => {
          console.error("Error:", error.message);
          Swal.fire({
            icon: "error",
            title: "Oops...",
            text: "An error occurred. Please try again later.",
          });
        });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).send("Internal Server Error");
    }
  }
);

async function authorize() {
  const jwtClient = new google.auth.JWT(
    apikeys.client_email,
    null,
    apikeys.private_key.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/drive"]
  );

  await jwtClient.authorize();
  return jwtClient;
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
