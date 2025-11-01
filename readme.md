## Chest - a FOSS catbox clone with fun features
Chest (We need a better name!) is a FOSS catbox-like clone written in JavaScript.
The goal of Chest is to make it so everyone can host their own filesharing service off their computer with ease so they can share files with their friends.
Chest's base source is based off of oaktown's oakchest but has been drastically changed in the UI and under the hood too.
## Features
Chest allows you to
- Upload files to a database on the server for others to download
- A public repository of files (you can mark your file to be public or not)
- View which files you've uploaded using your own user account
- Change your user account so multiple people or devices can use the same account
- A password system to not let randoms upload files to your database
- A file size limit so someone can't upload a whole game to your drive
And more!
## Contributing
I am completely open to pull requests and suggestions, if you have a suggestion then make it a issue and if you want to contribute I would be happy to see that.
If you have any ideas on how to improve Chest then tell me!
## Hosting Chest
You will need [Node.js](https://nodejs.org/en)

Once you have Node.js installed go to the folder where you extracted the source code and run
~~~
npm install
~~~
to install dependencies, this won't work without them!

Once you're done installing the dependencies rename config.toml.example to just config.toml (Be sure to check the settings if you want to change something!)

After renaming it you can run the website
~~~
node server.js
~~~
Once it's running it'll make some files but after that you can start uploading files.


