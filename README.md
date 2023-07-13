Install Node JS on your system. On linux, do below

sudo apt update

sudo apt install nodejs

Verify Installation: After the installation is complete, verify that Node.js is installed correctly. Run the following commands to check the installed versions

node --version

npm --version


Then download the folder that you want to use - 
1) Master folder has files for streaming single webcam video stream -
There are 3 versions of Master folders - one for streaming single camera, and two for streaming two videos with different code to see which one works well.


2) Viewer folder has files for receiving upto 2 video streams


Navigate to the folder within the master or viewer file within the terminal:


Run below command:

node server.js

This will give you a link and will give a message that server is running. 

Copy that link and open it in your browser.
Give required permissions for accessing video to your browser.
