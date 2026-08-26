export type ImprovementRequestKey =
	| "young_londo"
	| "londo"
	| "main"
	| "recruit";

export const FAMILY_HIERARCHY_ENTRIES = [
	{
		title: "Newbie",
		description:
			"Вступил, но не поменял фамилию. На этом ранге вообще нет доступа к машинам.",
		conditions: "Вступить в семью.",
	},
	{
		title: "Baby Londo",
		description: "Только вступили в семью и поменяли фамилию.",
		conditions: "Сменить фамилию на Londo.",
	},
	{
		title: "Young Londo",
		description: "Новички, которые уже повидали жизнь.",
		conditions: "Пробыть неделю в семье.",
	},
	{
		title: "Londo",
		description: "Основной состав семьи.",
		conditions: "Пробыть месяц в семье, а также выполнять контракты.",
	},
	{
		title: "Main",
		description: "Люди, которые прошли с нами огонь и воду.",
		conditions: "По решению старшего состава.",
	},
	{
		title: "Londest Londo",
		description:
			"Этот ранг создан для людей, которые финансово поддерживают семью и помогают развивать общий счёт.",
		conditions: "Условия выдачи: пополнить счёт семьи на 350.000$ и предоставить доказательство.",
	},
	{
		title: "Recruit",
		description: "Люди, которые занимаются наймом людей в семью и проводят обзвоны.",
		conditions: "Пройти обзвон и согласовать со старшим составом.",
	},
	{
		title: "High Staff",
		description:
			"Ответственные люди за незначительные вопросы в фаме, помогут решить несложную проблему.",
		conditions: "По решению Owner и Dep Owner.",
	},
] as const;

export const IMPROVEMENT_REQUESTS: Record<
	ImprovementRequestKey,
	{
		label: string;
		description: string;
		requirements: string;
	}
> = {
	young_londo: {
		label: "Повышение до Young Londo",
		description: "Следующий шаг после Baby Londo.",
		requirements: "Пробыть неделю в семье.",
	},
	londo: {
		label: "Повышение до Londo",
		description: "Переход в основной состав семьи.",
		requirements: "Пробыть месяц в семье и выполнять контракты.",
	},
	main: {
		label: "Повышение до Main",
		description: "Ранг для тех, кто уже доказал свою надёжность.",
		requirements: "Решение старшего состава.",
	},
	recruit: {
		label: "Стать Recruit",
		description: "Для тех, кто хочет заниматься набором и обзвонами.",
		requirements: "Пройти обзвон и согласовать со старшим составом.",
	},
};
