use bolt_lang::*;

declare_id!("g9Y3zHKWC9kJ9CYLQuDkZP7qVwhh6yu2swhxrXn7sVn");

pub const ACTION_IDLE: u8 = 0;
pub const ACTION_MOVE: u8 = 1;
pub const ACTION_SLEEP: u8 = 2;
pub const ACTION_TILL: u8 = 3;
pub const ACTION_WATER: u8 = 4;
pub const ACTION_PLANT: u8 = 5;
pub const ACTION_HARVEST: u8 = 6;
pub const ACTION_CHOP: u8 = 7;
pub const ACTION_GRAB: u8 = 8;

#[component(delegate)]
#[derive(Default)]
pub struct ActiveAction {
    pub action: u8,
    pub started_at: i64,
    pub ends_at: i64,
}

impl ActiveAction {
    pub fn is_active(&self, now: i64) -> bool {
        self.ends_at > now
    }

    pub fn start(&mut self, action: u8, now: i64, duration_seconds: i64) {
        self.action = action;
        self.started_at = now;
        self.ends_at = now + duration_seconds;
    }

    pub fn clear_if_done(&mut self, now: i64) {
        if !self.is_active(now) {
            self.action = ACTION_IDLE;
            self.started_at = 0;
            self.ends_at = 0;
        }
    }
}
