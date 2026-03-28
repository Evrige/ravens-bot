export type DailyEventSchedule = {
	name: string;
	hour: number;
	minute: number;
	daysOfWeek: number[];
};

// Days use UTC numbering because reminders are calculated in a fixed UTC+3 offset.
// 0 = Sunday, 1 = Monday, ... 6 = Saturday.
export const DAILY_EVENT_SCHEDULE: DailyEventSchedule[] = [
	{
		name: "Вербовка диллеров",
		hour: 10,
		minute: 45,
		daysOfWeek: [0, 1, 2, 3, 4, 5, 6]
	},
	{
		name: "Захват цехов",
		hour: 14,
		minute: 45,
		daysOfWeek: [0, 1, 2, 3, 4, 5, 6]
	},
	{
		name: "Начало захвата острова",
		hour: 16,
		minute: 0,
		daysOfWeek: [1, 3, 5, 0]
	},
	{
		name: "Нападение на Форт-Занкудо",
		hour: 16,
		minute: 0,
		daysOfWeek: [2, 4, 6]
	},
	{
		name: "Вербовка диллеров",
		hour: 18,
		minute: 45,
		daysOfWeek: [0, 1, 2, 3, 4, 5, 6]
	},
	{
		name: "Захват цехов",
		hour: 22,
		minute: 45,
		daysOfWeek: [0, 1, 2, 3, 4, 5, 6]
	}
];
