const { spawn } = require('child_process');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 8000;

const downloadPath = path.join(__dirname, '../public/downloads');
const downloadFolder = path.join(__dirname, '../public/downloads');
if (!fs.existsSync(downloadFolder)) {
    fs.mkdirSync(downloadFolder, { recursive: true });
}

const clearDownloadsFolder = () => {
    try {
        fs.readdirSync(downloadFolder).forEach((file) => {
            fs.unlinkSync(path.join(downloadFolder, file));
        });
        console.log('Downloads folder cleared successfully.');
    } catch (error) {
        console.error('Error clearing downloads folder:', error);
    }
};

// Base upload directory
const uploadFolder = path.join(__dirname, '../uploads');
// Ensure base upload folder exists
if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder, { recursive: true });
}

// Specific directories for templates and Excel files
const templatesFolder = path.join(uploadFolder, 'templates');
const excelFolder = path.join(uploadFolder, 'excel');

// Ensure specific folders exist
[templatesFolder, excelFolder].forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
});

// Output folder for generated files
const outputFolder = path.join(__dirname, '../output');
// Ensure output folder exists
if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === "docx-files") {
            cb(null, templatesFolder);
        } else if (file.fieldname === "excel-file") {
            cb(null, excelFolder);
        } else {
            cb(new Error("Unknown file type"), '');
        }
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

app.use('/downloads', express.static(downloadFolder));

app.post('/process-merge', upload.fields([
    { name: 'docx-files', maxCount: 10 },
    { name: 'excel-file', maxCount: 1 }
]), (req, res) => {
    const templates = req.files['docx-files'].map(file => file.path);
    const excelFile = req.files['excel-file'][0].path;
    const outputFormat = req.body['output-format'];

    const pythonProcess = spawn('python', [
        'merge.py',
        '--template_folder', templatesFolder,
        '--excel_folder', excelFolder,
        '--output_format', outputFormat,
        '--output_folder', outputFolder
    ]);
    
    let outputData = '';
    pythonProcess.stdout.on('data', (data) => {
        outputData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
        if (code !== 0) {
            if (!res.headersSent) {
                res.status(500).send('Error processing documents');
            }
        } else {
            // Move generated files to download folder
            const generatedFiles = fs.readdirSync(outputFolder);
            generatedFiles.forEach(file => {
                fs.renameSync(path.join(outputFolder, file), path.join(downloadFolder, file));
            });

            // Get download URLs
            //const downloadLinks = fs.readdirSync(downloadFolder).map(file => `http://${}${port}/downloads/${file}`); 
            const downloadLinks = fs.readdirSync(downloadFolder).map(file =>`${req.protocol}://${req.get('host')}/downloads/${file}`);
            
            if (!res.headersSent) {
                res.json(downloadLinks);  // Send the list of download URLs to the client
            }

            fs.readdirSync(templatesFolder).forEach(file => {
                fs.unlinkSync(path.join(templatesFolder, file));
            });

            fs.readdirSync(excelFolder).forEach(file => {
                fs.unlinkSync(path.join(excelFolder, file));
            });

        }
    }); 
});

app.post('/cleanup_downloads', (req, res) => {
    clearDownloadsFolder(); // Clear the downloads folder on request
    res.status(200).send('Downloads folder has been cleared.');
});
// Serve static files from the public directory
app.use(express.static('../public'));

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
