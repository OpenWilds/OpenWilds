use bolt_lang::*;

declare_id!("HtQi1ESxw8jY5383gaTwtv8vwJbSKfZcFuRb3vPq86KU");

pub const SOIL_UNTILLED: u8 = 0;
pub const SOIL_TILLED: u8 = 1;
pub const GAME_SECONDS_PER_DAY: i64 = 24 * 60 * 60;
pub const REAL_SECONDS_PER_GAME_DAY: i64 = 5 * 60;
pub const WORLD_EPOCH_UNIX_SECONDS: i64 = 1_735_689_600;

pub fn game_time_from_unix(unix_timestamp: i64) -> i64 {
    unix_timestamp
        .saturating_sub(WORLD_EPOCH_UNIX_SECONDS)
        .saturating_mul(GAME_SECONDS_PER_DAY)
        / REAL_SECONDS_PER_GAME_DAY
}

#[component(delegate)]
#[derive(Default)]
pub struct TileFarm {
    pub x: i64,
    pub y: i64,
    pub soil_state: u8,
    pub farm_type_id: u16,
    pub planted_at: i64,
    pub growth_seconds: u32,
    pub growth_updated_at: i64,
    pub watered_until: i64,
    pub last_harvested_at: i64,
    pub harvest_count: u32,
}

impl TileFarm {
    pub fn is_initialized(&self) -> bool {
        self.x != 0
            || self.y != 0
            || self.soil_state != SOIL_UNTILLED
            || self.farm_type_id != 0
            || self.planted_at != 0
            || self.growth_updated_at != 0
    }

    pub fn has_plant(&self) -> bool {
        self.farm_type_id != 0
    }

    pub fn is_tilled(&self) -> bool {
        self.soil_state == SOIL_TILLED
    }

    pub fn settle_growth(&mut self, now: i64, needs_water: bool) {
        if !self.has_plant() || self.growth_updated_at == 0 || now <= self.growth_updated_at {
            return;
        }

        let growth_until = if needs_water {
            self.watered_until.min(now)
        } else {
            now
        };

        if growth_until <= self.growth_updated_at {
            self.growth_updated_at = now;
            return;
        }

        let elapsed = (growth_until - self.growth_updated_at) as u32;
        self.growth_seconds = self.growth_seconds.saturating_add(elapsed);
        self.growth_updated_at = now;
    }

    pub fn is_harvest_ready(
        &self,
        now: i64,
        required_growth_seconds: u32,
        regrow_seconds: u32,
    ) -> bool {
        if !self.has_plant() || self.growth_seconds < required_growth_seconds {
            return false;
        }

        self.last_harvested_at == 0
            || (regrow_seconds > 0 && now - self.last_harvested_at >= regrow_seconds as i64)
    }

    pub fn clear_plant(&mut self) {
        self.farm_type_id = 0;
        self.planted_at = 0;
        self.growth_seconds = 0;
        self.growth_updated_at = 0;
        self.watered_until = 0;
        self.last_harvested_at = 0;
        self.harvest_count = 0;
    }
}
