const mongoose = require("mongoose");

const AstrologerActivity = require("../../models/AstrologerActivity");

function formatDuration(seconds = 0) {
  const days = Math.floor(seconds / 86400);

  const hours = Math.floor((seconds % 86400) / 3600);

  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];

  if (days > 0) {
    parts.push(`${days} day${days > 1 ? "s" : ""}`);
  }

  if (hours > 0) {
    parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
  }

  if (minutes > 0) {
    parts.push(`${minutes} min`);
  }

  return parts.length ? parts.join(" ") : "0 min";
}

async function getTotalDuration(astrologerId, startDate = null) {
  const match = {
    astrologer_id: new mongoose.Types.ObjectId(astrologerId),
  };

  if (startDate) {
    match.activity_date = {
      $gte: startDate.toISOString().split("T")[0],
    };
  }

  const result = await AstrologerActivity.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: null,
        totalSeconds: {
          $sum: "$total_online_seconds",
        },
      },
    },
  ]);

  return result[0]?.totalSeconds || 0;
}

async function getAnalytics(astrologerId) {
  const result = await AstrologerActivity.aggregate([
    {
      $match: {
        astrologer_id: new mongoose.Types.ObjectId(astrologerId),
      },
    },
    {
      $group: {
        _id: null,

        totalSeconds: {
          $sum: "$total_online_seconds",
        },

        totalLoginCount: {
          $sum: "$login_count",
        },

        totalActiveDays: {
          $sum: 1,
        },

        activeDates: {
          $addToSet: "$activity_date",
        },
      },
    },
  ]);

  const stats = result[0] || {};

  const totalSeconds = stats.totalSeconds || 0;

  const totalLoginCount = stats.totalLoginCount || 0;

  const activeDates = stats.activeDates || [];

  const totalActiveDays = activeDates.length;

  const activeWeeks = new Set(
    activeDates.map((date) => {
      const d = new Date(date);

      const year = d.getFullYear();

      const week = Math.ceil(
        ((d - new Date(year, 0, 1)) / 86400000 +
          new Date(year, 0, 1).getDay() +
          1) /
          7,
      );

      return `${year}-${week}`;
    }),
  ).size;

  const activeMonths = new Set(
    activeDates.map((date) => {
      const d = new Date(date);

      return `${d.getFullYear()}-${d.getMonth() + 1}`;
    }),
  ).size;

  const activeYears = new Set(
    activeDates.map((date) => {
      const d = new Date(date);

      return d.getFullYear();
    }),
  ).size;

  const avgDailySeconds =
    totalActiveDays > 0 ? Math.floor(totalSeconds / totalActiveDays) : 0;

  const avgWeeklySeconds =
    activeWeeks > 0 ? Math.floor(totalSeconds / activeWeeks) : 0;

  const avgMonthlySeconds =
    activeMonths > 0 ? Math.floor(totalSeconds / activeMonths) : 0;

  const avgYearlySeconds =
    activeYears > 0 ? Math.floor(totalSeconds / activeYears) : 0;

  const avgSessionSeconds =
    totalLoginCount > 0 ? Math.floor(totalSeconds / totalLoginCount) : 0;

  return {
    total_active_days: totalActiveDays,

    total_active_weeks: activeWeeks,

    total_active_months: activeMonths,

    total_active_years: activeYears,

    total_logins: totalLoginCount,

    average_daily_activity: {
      seconds: avgDailySeconds,
      formatted: formatDuration(avgDailySeconds),
    },

    average_weekly_activity: {
      seconds: avgWeeklySeconds,
      formatted: formatDuration(avgWeeklySeconds),
    },

    average_monthly_activity: {
      seconds: avgMonthlySeconds,
      formatted: formatDuration(avgMonthlySeconds),
    },

    average_yearly_activity: {
      seconds: avgYearlySeconds,
      formatted: formatDuration(avgYearlySeconds),
    },

    average_session_duration: {
      seconds: avgSessionSeconds,
      formatted: formatDuration(avgSessionSeconds),
    },
  };
}

async function getAstrologerActivityReport(astrologerId) {
  const now = new Date();

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const weekStart = new Date(todayStart);

  weekStart.setDate(weekStart.getDate() - 7);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [
    todaySeconds,
    weekSeconds,
    monthSeconds,
    yearSeconds,
    overallSeconds,
    analytics,
  ] = await Promise.all([
    getTotalDuration(astrologerId, todayStart),

    getTotalDuration(astrologerId, weekStart),

    getTotalDuration(astrologerId, monthStart),

    getTotalDuration(astrologerId, yearStart),

    getTotalDuration(astrologerId),

    getAnalytics(astrologerId),
  ]);

  return {
    today: {
      seconds: todaySeconds,
      formatted: formatDuration(todaySeconds),
    },

    week: {
      seconds: weekSeconds,
      formatted: formatDuration(weekSeconds),
    },

    month: {
      seconds: monthSeconds,
      formatted: formatDuration(monthSeconds),
    },

    year: {
      seconds: yearSeconds,
      formatted: formatDuration(yearSeconds),
    },

    overall: {
      seconds: overallSeconds,
      formatted: formatDuration(overallSeconds),
    },

    analytics,
  };
}

module.exports = {
  getAstrologerActivityReport,
};
