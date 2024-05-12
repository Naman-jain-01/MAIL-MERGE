const { spawn } = require('child_process');
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 8000;

const downloadPath = path.join(__dirname, '../public/downloads'); // It's a good practice to use `downloadPath` instead of `downloadFolder` in app.use('/downloads', express.static(downloadFolder));
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
if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder, { recursive: true });
}

// Specific directories for templates and Excel files
const templatesFolder = path.join(uploadFolder, 'templates');
const excelFolder = path.join(uploadFolder, 'excel');

[templatesFolder, excelFolder].forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
});

const outputFolder = path.join(__dirname, '../output');
if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
}

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
    const pythonProcess = spawn('python', [
        'merge.py',
        '--template_folder', templatesFolder,
        '--excel_folder', excelFolder,
        '--output_format', req.body['output-format'], // Ensure 'output-format' is being sent in the form data
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
        if (code !== 0) {
            if (!res.headersSent) {
                res.status(500).send('Error processing documents');
            }
            return;
        }

        const generatedFiles = fs.readdirSync(outputFolder);
        generatedFiles.forEach(file => {
            fs.renameSync(path.join(outputFolder, file), path.join(downloadFolder, file));
        });

        const pythonUpload = spawn('python', [
            './upload.py', 
            '--folder', downloadFolder, // This should be downloadFolder, not outputFolder if you're uploading the generated files
            '--action', 'write'
        ]);

        pythonUpload.stdout.on('data', (data) => {
            outputData += data.toString(); // outputData was already declared above and is reused here which may cause confusion
        });

        pythonUpload.on('close', (uploadCode) => {
            if (uploadCode !== 0) {
                console.error(`Upload process exited with code ${uploadCode}`);
                if (!res.headersSent) {
                    res.status(500).send('Error uploading documents');
                }
                return;
            }
            const downloadLinks = outputData.trim().split('\n');
            res.json(downloadLinks);
        });

        fs.readdirSync(templatesFolder).forEach(file => {
            fs.unlinkSync(path.join(templatesFolder, file));
        });

        fs.readdirSync(excelFolder).forEach(file => {
            fs.unlinkSync(path.join(excelFolder, file));
        });
    });
});

app.post('/cleanup_downloads', (req, res) => {
    clearDownloadsFolder(); // Clear the downloads folder on request
    spawn('python', [
        './upload.py', 
        '--action', 'delete'
    ]);
    res.status(200).send('Downloads folder has been cleared.');


});
// Serve static files from the public directory
app.use(express.static('../public'));

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
