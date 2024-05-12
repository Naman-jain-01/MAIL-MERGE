import os
import argparse
import firebase_admin
from firebase_admin import credentials, storage

# Initialize Firebase Admin SDK
def initialize_firebase():
    # Replace './config.json' with the actual path to your Firebase Admin SDK private key
    cred = credentials.Certificate('./config.json')
    firebase_admin.initialize_app(cred, {
        'storageBucket': 'mail-896e4.appspot.com'
    })

# Upload files from the given folder to Firebase Storage
def upload_files_from_folder(folder_path):
    bucket = storage.bucket()
    urls = []

    for filename in os.listdir(folder_path):
        if os.path.isfile(os.path.join(folder_path, filename)):
            blob = bucket.blob(filename)
            blob.upload_from_filename(os.path.join(folder_path, filename))
            blob.make_public()
            urls.append(blob.public_url)

    return urls

# Delete all files in Firebase Storage
def delete_all_files():
    bucket = storage.bucket()
    blobs = bucket.list_blobs()

    deleted_files = []
    for blob in blobs:
        blob.delete()
        deleted_files.append(blob.name)

    return deleted_files

# Main function using argument parsing
def main():
    # Argument parser setup
    parser = argparse.ArgumentParser(description="Upload or delete files in Firebase Storage")
    parser.add_argument('--folder', type=str, help="Folder path to upload files from")
    parser.add_argument('--action', type=str, required=True, choices=['write', 'delete'], help="Action to perform: 'write' (upload) or 'delete' (delete all)")

    # Parse the command-line arguments
    args = parser.parse_args()

    # Initialize Firebase
    initialize_firebase()

    # Perform the requested action
    if args.action == 'write':
        if not args.folder:
            raise ValueError("Folder path is required when action is 'write'")
        download_urls = upload_files_from_folder(args.folder)
        print('\n'.join(download_urls))

    elif args.action == 'delete':
        deleted_files = delete_all_files()

# Execute the main function when the script is run directly
if __name__ == '__main__':
    main()
