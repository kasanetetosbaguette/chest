a fork of oak chest, for personal use...
## goals/roadmap
- account type system (input password and view your uploads)
- locked mode (need master password to upload files)
- settings (ex upload size limit)
probably more if i can think of it
## why does this exist?
oak chest was really the only catbox like open source webbased software i could think of (there's the og uguu though! but thats temporary)..
my friend was talking about wanting to host a file service for his friends but some of the things he wanted aren't in oak chest by default so i decided to take the challenge and try to make some of it.
i've not coded in js before so my code might be messy and not right... but i'm trying!
## hosting and install
you will need nodejs (nodejs comes with npm!)
first rename config.toml.example to just config.toml and edit it however you wish it to be (more options will be added later)
then run
~~~
npm install
~~~
to install dependencies and finally you can run the server using
~~~
node server.js
~~~
to host the server on localhost.. from there you can do all the web things :D

