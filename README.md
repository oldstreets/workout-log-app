# workout-log-app

This is a small web app written in Node that posts your workout data to a Tumblr app!  It also keeps track of your personal bests using a minimal database and displays them in separate tabs on the app.

To use the app:
---
1. Clone the repo
2. Install the dependencies using `npm install`
3. Install redis (I used version 2.8.19)
4. Have redis running somewhere using `redis-server`
5. Edit `keys.json` with your [Tumblr API credentials](https://www.tumblr.com/docs/en/api/v2)
6. Run the server using `node index.js`.  Enjoy!
