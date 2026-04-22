export type ImprovementRequestKey =
	| "young_ravens"
	| "ravens"
	| "main"
	| "maecenas"
	| "recruit";

export const FAMILY_HIERARCHY_ENTRIES = [
	{
		title: "Newbie",
		description:
			"Вступил, но не поменял фамилию. На этом ранге вообще нет доступа к машинам.",
		conditions: "Вступить в семью.",
	},
	{
		title: "Plum",
		description: "Только вступили в семью и поменяли фамилию.",
		conditions: "Сменить фамилию на Ravens.",
	},
	{
		title: "Young Ravens",
		description: "Новички, которые уже повидали жизнь.",
		conditions: "Пробыть неделю в семье.",
	},
	{
		title: "Ravens",
		description: "Основной состав семьи.",
		conditions: "Пробыть месяц в семье, а также выполнять контракты.",
	},
	{
		title: "Main",
		description: "Люди, которые прошли с нами огонь и воду.",
		conditions: "По решению старшего состава.",
	},
	{
		title: "Maecenas",
		description:
			"Ранг, на котором открывается доступ к крутым машинам, но раз в неделю вы скидываете 50к на фаму для починки этих машин.",
		conditions:
			"Если хотите пользоваться машинками, пишите старшему составу. По решению Owner, Dep Owner и High Staff. Можно получить только с мейн ранга.",
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
	young_ravens: {
		label: "Повышение до Young Ravens",
		description: "Следующий шаг после Plum.",
		requirements: "Пробыть неделю в семье.",
	},
	ravens: {
		label: "Повышение до Ravens",
		description: "Переход в основной состав семьи.",
		requirements: "Пробыть месяц в семье и выполнять контракты.",
	},
	main: {
		label: "Повышение до Main",
		description: "Ранг для тех, кто уже доказал свою надёжность.",
		requirements: "Решение старшего состава.",
	},
	maecenas: {
		label: "Получить Maecenas",
		description: "Открывает доступ к крутым машинам семьи.",
		requirements:
			"Нужно быть на Main ранге. Взнос 50к в неделю на починку машин. Решение Owner, Dep Owner и High Staff.",
	},
	recruit: {
		label: "Стать Recruit",
		description: "Для тех, кто хочет заниматься набором и обзвонами.",
		requirements: "Пройти обзвон и согласовать со старшим составом.",
	},
};
