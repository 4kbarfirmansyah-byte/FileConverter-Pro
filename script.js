// Global Variables
let imageFiles = [];
let pdfMergeFiles = [];
let audioFiles = [];
let videoFile = null;
let pdfCompressFile = null;
let pdfSplitFile = null;

// Utility Functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showLoading(message = 'Processing... Please wait') {
    document.getElementById('loading-modal').style.display = 'flex';
    document.querySelector('#loading-modal p').textContent = message;
    document.getElementById('modal-progress-fill').style.width = '0%';
}

function hideLoading() {
    document.getElementById('loading-modal').style.display = 'none';
}

function updateProgress(percent, message = null) {
    document.getElementById('modal-progress-fill').style.width = Math.min(100, percent) + '%';
    if (message) {
        document.querySelector('#loading-modal p').textContent = message;
    }
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showNotification(message, type = 'success') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#FF9800'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 3000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    notification.innerHTML = `
        <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️'}</span>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    .file-item.converting {
        background: #fff3cd;
        border-left: 4px solid #ffc107;
    }
    .file-item.completed {
        background: #d4edda;
        border-left: 4px solid #28a745;
    }
    .file-item.error {
        background: #f8d7da;
        border-left: 4px solid #dc3545;
    }
`;
document.head.appendChild(style);

// ==================== IMAGE CONVERTER ====================
document.getElementById('image-input').addEventListener('change', function(e) {
    imageFiles = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
        showNotification('Please select valid image files', 'error');
        return;
    }
    displayImageFiles();
    showNotification(`${imageFiles.length} image(s) loaded`);
});

function displayImageFiles() {
    const fileList = document.getElementById('image-file-list');
    fileList.innerHTML = '';
    
    imageFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.index = index;
        fileItem.innerHTML = `
            <i class="fas fa-image"></i>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">Original: ${formatFileSize(file.size)}</div>
            </div>
            <span class="remove-file" onclick="removeImageFile(${index})" title="Remove file">
                <i class="fas fa-times"></i>
            </span>
        `;
        fileList.appendChild(fileItem);
    });
    
    document.getElementById('convert-images-btn').disabled = imageFiles.length === 0;
}

function removeImageFile(index) {
    imageFiles.splice(index, 1);
    displayImageFiles();
    if (imageFiles.length === 0) {
        document.getElementById('image-input').value = '';
    }
}

document.getElementById('image-quality').addEventListener('input', function() {
    document.getElementById('quality-value').textContent = this.value;
});

document.getElementById('convert-images-btn').addEventListener('click', async function() {
    if (imageFiles.length === 0) return;
    
    const format = document.getElementById('image-format-select').value;
    const quality = parseInt(document.getElementById('image-quality').value) / 100;
    const formatExtension = format === 'image/jpeg' ? 'jpg' : format.split('/')[1];
    
    showLoading('Converting images...');
    let successCount = 0;
    let failCount = 0;
    
    try {
        for (let i = 0; i < imageFiles.length; i++) {
            updateProgress((i / imageFiles.length) * 100, `Converting ${imageFiles[i].name}...`);
            
            const file = imageFiles[i];
            const fileItem = document.querySelector(`.file-item[data-index="${i}"]`);
            if (fileItem) fileItem.classList.add('converting');
            
            try {
                // Load image
                const img = await loadImage(file);
                
                // Create canvas
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                
                // Handle transparency for JPEG
                if (format === 'image/jpeg') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                
                ctx.drawImage(img, 0, 0);
                
                // Convert to blob
                let blob = await canvasToBlob(canvas, format, quality);
                
                // If JPEG and size is larger, try progressive compression
                if (format === 'image/jpeg' && blob.size >= file.size) {
                    let q = quality;
                    while (q > 0.3 && blob.size >= file.size) {
                        q -= 0.1;
                        blob = await canvasToBlob(canvas, format, q);
                    }
                }
                
                // For WebP, try different quality if needed
                if (format === 'image/webp' && blob.size >= file.size) {
                    let q = quality;
                    while (q > 0.3 && blob.size >= file.size) {
                        q -= 0.1;
                        blob = await canvasToBlob(canvas, format, q);
                    }
                }
                
                // Download converted image
                const newName = file.name.replace(/\.[^.]+$/, '') + '_converted.' + formatExtension;
                downloadBlob(blob, newName);
                
                // Update file item
                if (fileItem) {
                    fileItem.classList.remove('converting');
                    fileItem.classList.add('completed');
                    const sizeElement = fileItem.querySelector('.file-size');
                    const reduction = ((1 - blob.size / file.size) * 100).toFixed(1);
                    sizeElement.textContent = `Converted: ${formatFileSize(blob.size)} (${reduction > 0 ? '-' : '+'}${Math.abs(reduction)}%)`;
                }
                
                successCount++;
            } catch (error) {
                console.error(`Error converting ${file.name}:`, error);
                if (fileItem) {
                    fileItem.classList.remove('converting');
                    fileItem.classList.add('error');
                }
                failCount++;
            }
            
            // Small delay to allow UI update
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        updateProgress(100, 'Conversion complete!');
        setTimeout(() => {
            hideLoading();
            if (failCount === 0) {
                showNotification(`✅ Successfully converted ${successCount} image(s)!`);
            } else {
                showNotification(`⚠️ Converted ${successCount} image(s), failed ${failCount}`, 'warning');
            }
        }, 500);
        
    } catch (error) {
        hideLoading();
        showNotification('❌ Error converting images: ' + error.message, 'error');
    }
});

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to convert image'));
            }
        }, type, quality);
    });
}

// Drag and Drop for Image Upload
const imageUploadArea = document.getElementById('image-upload-area');
imageUploadArea.addEventListener('dragover', function(e) {
    e.preventDefault();
    this.classList.add('dragover');
});

imageUploadArea.addEventListener('dragleave', function() {
    this.classList.remove('dragover');
});

imageUploadArea.addEventListener('drop', function(e) {
    e.preventDefault();
    this.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    if (files.length > 0) {
        imageFiles = files;
        displayImageFiles();
        showNotification(`${imageFiles.length} image(s) loaded via drag & drop`);
    }
});

// ==================== PDF TOOLS ====================
// PDF Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const tab = this.dataset.tab;
        
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        document.querySelectorAll('.pdf-tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(tab + '-tab').classList.add('active');
    });
});

// PDF Merge Functions
document.getElementById('pdf-merge-input').addEventListener('change', function(e) {
    pdfMergeFiles = Array.from(e.target.files).filter(file => file.type === 'application/pdf');
    if (pdfMergeFiles.length < 2) {
        showNotification('Please select at least 2 PDF files', 'warning');
        return;
    }
    displayPDFMergeFiles();
    showNotification(`${pdfMergeFiles.length} PDF files loaded for merging`);
});

function displayPDFMergeFiles() {
    const fileList = document.getElementById('pdf-merge-list');
    fileList.innerHTML = '';
    
    pdfMergeFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <i class="fas fa-file-pdf"></i>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${formatFileSize(file.size)}</div>
            </div>
            <span class="remove-file" onclick="removePDFMergeFile(${index})" title="Remove file">
                <i class="fas fa-times"></i>
            </span>
        `;
        fileList.appendChild(fileItem);
    });
    
    document.getElementById('merge-pdf-btn').disabled = pdfMergeFiles.length < 2;
}

function removePDFMergeFile(index) {
    pdfMergeFiles.splice(index, 1);
    displayPDFMergeFiles();
    if (pdfMergeFiles.length === 0) {
        document.getElementById('pdf-merge-input').value = '';
    }
}

document.getElementById('merge-pdf-btn').addEventListener('click', async function() {
    if (pdfMergeFiles.length < 2) return;
    
    showLoading('Merging PDF files...');
    updateProgress(5);
    
    try {
        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();
        
        for (let i = 0; i < pdfMergeFiles.length; i++) {
            updateProgress(5 + (i / pdfMergeFiles.length) * 85, `Processing ${pdfMergeFiles[i].name}...`);
            const file = pdfMergeFiles[i];
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }
        
        updateProgress(90, 'Saving merged PDF...');
        const mergedPdfBytes = await mergedPdf.save();
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        downloadBlob(blob, 'merged_' + new Date().getTime() + '.pdf');
        
        updateProgress(100, 'Merge complete!');
        setTimeout(() => {
            hideLoading();
            showNotification(`✅ Successfully merged ${pdfMergeFiles.length} PDF files!`);
        }, 500);
    } catch (error) {
        hideLoading();
        showNotification('❌ Error merging PDFs: ' + error.message, 'error');
    }
});

// PDF Compress Functions
document.getElementById('pdf-compress-input').addEventListener('change', function(e) {
    pdfCompressFile = e.target.files[0];
    if (pdfCompressFile && pdfCompressFile.type === 'application/pdf') {
        document.getElementById('compress-pdf-btn').disabled = false;
        showNotification(`PDF loaded: ${formatFileSize(pdfCompressFile.size)}`);
    } else {
        showNotification('Please select a valid PDF file', 'error');
        document.getElementById('compress-pdf-btn').disabled = true;
    }
});

document.getElementById('compress-pdf-btn').addEventListener('click', async function() {
    if (!pdfCompressFile) return;
    
    const compressionLevel = document.getElementById('compression-level').value;
    showLoading('Compressing PDF...');
    updateProgress(10, 'Loading PDF...');
    
    try {
        const { PDFDocument } = PDFLib;
        
        // Load original PDF
        const arrayBuffer = await pdfCompressFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { 
            ignoreEncryption: true,
            updateMetadata: false 
        });
        
        updateProgress(30, 'Optimizing PDF structure...');
        
        // Remove metadata
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('');
        pdfDoc.setCreator('');
        pdfDoc.setCreationDate(new Date(0));
        pdfDoc.setModificationDate(new Date(0));
        
        updateProgress(50, 'Compressing content...');
        
        // Save with compression settings
        let saveOptions = {
            useObjectStreams: true,
            addDefaultPage: false,
            objectsPerTick: 50
        };
        
        // Adjust compression based on level
        switch(compressionLevel) {
            case 'high':
                saveOptions.useObjectStreams = true;
                saveOptions.objectsPerTick = 20;
                break;
            case 'medium':
                saveOptions.useObjectStreams = true;
                saveOptions.objectsPerTick = 50;
                break;
            case 'low':
                saveOptions.useObjectStreams = false;
                saveOptions.objectsPerTick = 100;
                break;
        }
        
        let compressedPdfBytes = await pdfDoc.save(saveOptions);
        let compressedSize = compressedPdfBytes.length;
        const originalSize = pdfCompressFile.size;
        
        updateProgress(70, 'Checking compression ratio...');
        
        // If compression didn't reduce size enough, try more aggressive methods
        if (compressedSize >= originalSize) {
            // Create a new PDF with just the pages (removes all metadata and optimizes)
            const newPdf = await PDFDocument.create();
            const pages = await newPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            pages.forEach(page => newPdf.addPage(page));
            
            const optimizedBytes = await newPdf.save({
                useObjectStreams: true,
                addDefaultPage: false
            });
            
            if (optimizedBytes.length < compressedSize) {
                compressedPdfBytes = optimizedBytes;
                compressedSize = optimizedBytes.length;
            }
        }
        
        updateProgress(90, 'Saving compressed PDF...');
        
        const blob = new Blob([compressedPdfBytes], { type: 'application/pdf' });
        const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
        
        downloadBlob(blob, 'compressed_' + pdfCompressFile.name);
        
        updateProgress(100, 'Compression complete!');
        setTimeout(() => {
            hideLoading();
            if (reduction > 0) {
                showNotification(`✅ PDF compressed: ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)} (${reduction}% reduction)`);
            } else {
                showNotification(`ℹ️ PDF optimized but size didn't reduce significantly (${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)})`, 'warning');
            }
        }, 500);
    } catch (error) {
        hideLoading();
        showNotification('❌ Error compressing PDF: ' + error.message, 'error');
    }
});

// PDF Split Functions
document.getElementById('pdf-split-input').addEventListener('change', function(e) {
    pdfSplitFile = e.target.files[0];
    if (pdfSplitFile && pdfSplitFile.type === 'application/pdf') {
        document.getElementById('split-pdf-btn').disabled = false;
        showNotification(`PDF loaded: ${formatFileSize(pdfSplitFile.size)}`);
    } else {
        showNotification('Please select a valid PDF file', 'error');
        document.getElementById('split-pdf-btn').disabled = true;
    }
});

document.getElementById('split-pdf-btn').addEventListener('click', async function() {
    if (!pdfSplitFile) return;
    
    showLoading('Splitting PDF...');
    updateProgress(10, 'Loading PDF...');
    
    try {
        const { PDFDocument } = PDFLib;
        const arrayBuffer = await pdfSplitFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const pageCount = pdfDoc.getPageCount();
        
        for (let i = 0; i < pageCount; i++) {
            updateProgress(10 + (i / pageCount) * 80, `Extracting page ${i + 1} of ${pageCount}...`);
            
            const newPdf = await PDFDocument.create();
            const [page] = await newPdf.copyPages(pdfDoc, [i]);
            newPdf.addPage(page);
            
            const pdfBytes = await newPdf.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            
            // Download with slight delay to prevent browser blocking
            downloadBlob(blob, `${pdfSplitFile.name.replace('.pdf', '')}_page_${i + 1}.pdf`);
            
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        updateProgress(100, 'Split complete!');
        setTimeout(() => {
            hideLoading();
            showNotification(`✅ PDF split into ${pageCount} pages!`);
        }, 500);
    } catch (error) {
        hideLoading();
        showNotification('❌ Error splitting PDF: ' + error.message, 'error');
    }
});

// ==================== VIDEO COMPRESSOR ====================
document.getElementById('video-input').addEventListener('change', function(e) {
    videoFile = e.target.files[0];
    if (videoFile && videoFile.type.startsWith('video/')) {
        document.getElementById('compress-video-btn').disabled = false;
        showNotification(`Video loaded: ${formatFileSize(videoFile.size)}`);
    } else {
        showNotification('Please select a valid video file', 'error');
        document.getElementById('compress-video-btn').disabled = true;
    }
});

document.getElementById('video-compression').addEventListener('input', function() {
    document.getElementById('video-quality-value').textContent = this.value;
});

document.getElementById('compress-video-btn').addEventListener('click', async function() {
    if (!videoFile) return;
    
    const compressionLevel = parseInt(document.getElementById('video-compression').value);
    showLoading('Compressing video...');
    updateProgress(5, 'Loading video...');
    
    try {
        // Create video element
        const video = document.createElement('video');
        video.src = URL.createObjectURL(videoFile);
        video.muted = true;
        video.playsInline = true;
        
        await new Promise((resolve, reject) => {
            video.onloadedmetadata = resolve;
            video.onerror = () => reject(new Error('Failed to load video'));
            setTimeout(() => reject(new Error('Video loading timeout')), 10000);
        });
        
        updateProgress(20, 'Preparing compression...');
        
        // Calculate new dimensions
        const scaleFactor = Math.max(0.3, 1 - (compressionLevel / 150)); // More aggressive scaling
        const newWidth = Math.round(video.videoWidth * scaleFactor);
        const newHeight = Math.round(video.videoHeight * scaleFactor);
        
        // Create canvas for frame capture
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext('2d');
        
        // Setup MediaRecorder
        const stream = canvas.captureStream(24); // Reduced fps for smaller size
        const mimeType = 'video/webm;codecs=vp9';
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: mimeType,
            videoBitsPerSecond: Math.max(100000, 5000000 * (1 - compressionLevel / 100)) // Dynamic bitrate
        });
        
        const chunks = [];
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };
        
        mediaRecorder.onstop = () => {
            const compressedBlob = new Blob(chunks, { type: 'video/webm' });
            const compressedSize = compressedBlob.size;
            const originalSize = videoFile.size;
            
            updateProgress(90, 'Saving compressed video...');
            
            // Download compressed video
            const newName = videoFile.name.replace(/\.[^.]+$/, '') + '_compressed.webm';
            downloadBlob(compressedBlob, newName);
            
            const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
            
            updateProgress(100, 'Compression complete!');
            setTimeout(() => {
                hideLoading();
                showNotification(`✅ Video compressed: ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)} (${reduction}% reduction)`);
            }, 500);
            
            // Cleanup
            URL.revokeObjectURL(video.src);
            stream.getTracks().forEach(track => track.stop());
        };
        
        // Start recording
        mediaRecorder.start(1000); // Collect data every second
        
        // Play video and draw frames
        video.currentTime = 0;
        await video.play();
        
        // Draw frames continuously
        const drawFrame = () => {
            if (video.paused || video.ended) return;
            ctx.drawImage(video, 0, 0, newWidth, newHeight);
            requestAnimationFrame(drawFrame);
        };
        drawFrame();
        
        // Update progress based on video time
        const updateVideoProgress = setInterval(() => {
            const progress = 20 + (video.currentTime / video.duration) * 60;
            updateProgress(progress, `Compressing... ${Math.round((video.currentTime / video.duration) * 100)}%`);
        }, 100);
        
        // Handle video end
        video.onended = () => {
            clearInterval(updateVideoProgress);
            mediaRecorder.stop();
            video.pause();
        };
        
        // Safety timeout (max 5 minutes)
        setTimeout(() => {
            if (mediaRecorder.state === 'recording') {
                clearInterval(updateVideoProgress);
                mediaRecorder.stop();
                video.pause();
            }
        }, Math.min(video.duration * 1000, 300000));
        
    } catch (error) {
        hideLoading();
        console.error('Video compression error:', error);
        showNotification('⚠️ Client-side video compression is limited. For better results, use server-side tools.', 'warning');
    }
});

// ==================== AUDIO CONVERTER ====================
document.getElementById('audio-input').addEventListener('change', function(e) {
    audioFiles = Array.from(e.target.files).filter(file => file.type.startsWith('audio/'));
    if (audioFiles.length === 0) {
        showNotification('Please select valid audio files', 'error');
        return;
    }
    displayAudioFiles();
    showNotification(`${audioFiles.length} audio file(s) loaded`);
});

function displayAudioFiles() {
    const fileList = document.getElementById('audio-file-list');
    fileList.innerHTML = '';
    
    audioFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.index = index;
        fileItem.innerHTML = `
            <i class="fas fa-music"></i>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">Original: ${formatFileSize(file.size)}</div>
            </div>
            <span class="remove-file" onclick="removeAudioFile(${index})" title="Remove file">
                <i class="fas fa-times"></i>
            </span>
        `;
        fileList.appendChild(fileItem);
    });
    
    document.getElementById('convert-audio-btn').disabled = audioFiles.length === 0;
}

function removeAudioFile(index) {
    audioFiles.splice(index, 1);
    displayAudioFiles();
    if (audioFiles.length === 0) {
        document.getElementById('audio-input').value = '';
    }
}

document.getElementById('audio-bitrate').addEventListener('input', function() {
    document.getElementById('audio-quality-value').textContent = this.value;
});

document.getElementById('convert-audio-btn').addEventListener('click', async function() {
    if (audioFiles.length === 0) return;
    
    const format = document.getElementById('audio-format-select').value;
    const bitrate = parseInt(document.getElementById('audio-bitrate').value) * 1000;
    const formatExtension = format === 'audio/mpeg' ? 'mp3' : format.split('/')[1];
    
    showLoading('Converting audio files...');
    let successCount = 0;
    let failCount = 0;
    
    try {
        for (let i = 0; i < audioFiles.length; i++) {
            updateProgress((i / audioFiles.length) * 100, `Converting ${audioFiles[i].name}...`);
            
            const file = audioFiles[i];
            const fileItem = document.querySelector(`.file-item[data-index="${i}"]`);
            if (fileItem) fileItem.classList.add('converting');
            
            try {
                // Use Web Audio API for conversion
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                // Create offline context for rendering
                const offlineContext = new OfflineAudioContext(
                    audioBuffer.numberOfChannels,
                    audioBuffer.length,
                    audioBuffer.sampleRate
                );
                
                // Create buffer source
                const source = offlineContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(offlineContext.destination);
                source.start();
                
                // Render audio
                const renderedBuffer = await offlineContext.startRendering();
                
                // Convert to WAV (most compatible format)
                const wavBlob = audioBufferToWav(renderedBuffer);
                
                // Download converted audio
                const newName = file.name.replace(/\.[^.]+$/, '') + '_converted.wav';
                downloadBlob(wavBlob, newName);
                
                // Update file item
                if (fileItem) {
                    fileItem.classList.remove('converting');
                    fileItem.classList.add('completed');
                    const sizeElement = fileItem.querySelector('.file-size');
                    sizeElement.textContent = `Converted to WAV: ${formatFileSize(wavBlob.size)}`;
                }
                
                successCount++;
            } catch (error) {
                console.error(`Error converting ${file.name}:`, error);
                if (fileItem) {
                    fileItem.classList.remove('converting');
                    fileItem.classList.add('error');
                }
                failCount++;
            }
            
            // Small delay to allow UI update
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        updateProgress(100, 'Conversion complete!');
        setTimeout(() => {
            hideLoading();
            if (failCount === 0) {
                showNotification(`✅ Successfully converted ${successCount} audio file(s) to WAV format!`);
            } else {
                showNotification(`⚠️ Converted ${successCount} audio file(s), failed ${failCount}. Note: Browser conversion only supports WAV output.`, 'warning');
            }
        }, 500);
        
    } catch (error) {
        hideLoading();
        showNotification('❌ Error converting audio: ' + error.message, 'error');
    }
});

// Helper function to convert AudioBuffer to WAV
function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const data = new Float32Array(buffer.length * numChannels);
    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < buffer.length; i++) {
            data[i * numChannels + channel] = channelData[i];
        }
    }
    
    const dataSize = data.length * bytesPerSample;
    const bufferSize = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);
    
    // Write WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < data.length; i++) {
        const sample = Math.max(-1, Math.min(1, data[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Initialize
console.log('FileConverter Pro v2.0 is ready!');
console.log('Features:');
console.log('- Image conversion with real compression');
console.log('- PDF merge, compress, and split');
console.log('- Video compression (client-side)');
console.log('- Audio conversion (to WAV format)');