module.exports = {
    CronJob: jest.fn(function(cronTime, onTick) {
        this.onTick = onTick;
        this.start = jest.fn(() => { this.running = true; });
        this.stop = jest.fn(() => { this.running = false; });
        this.setTime = jest.fn();
        this.running = false; // Default to false
    }),
    CronTime: jest.fn(function(time) {
        this.time = time;
    }),
};
