export type GiveawayTemplateKey = "sentice" | "money" | "premium";

export const GIVEAWAY_TEMPLATES: Record<
	GiveawayTemplateKey,
	{
		label: string;
		icon: string;
		accent: string;
		buttonLabel: string;
	}
> = {
	sentice: {
		label: "sentice",
		icon: "👑",
		accent: "Стандартный розыгрыш",
		buttonLabel: "Участвовать",
	},
	money: {
		label: "Денежный",
		icon: "💸",
		accent: "Денежный приз",
		buttonLabel: "Забрать шанс",
	},
	premium: {
		label: "Премиум",
		icon: "👑",
		accent: "Особый розыгрыш",
		buttonLabel: "Вступить в розыгрыш",
	},
};

export const GIVEAWAY_TEMPLATE_CHOICES = [
	{ name: "sentice", value: "sentice" },
	{ name: "money", value: "money" },
	{ name: "premium", value: "premium" },
] as const;
