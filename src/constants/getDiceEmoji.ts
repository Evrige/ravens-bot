export function getDiceEmoji(roll: number) {
	switch (roll) {
		case 1: return "<:dice_1:1501654545825005700>";
		case 2: return "<:dice_2:1501654607057911989>";
		case 3: return "<:dice_3:1501654663521632366>";
		case 4: return "<:dice_4:1501654719137976524>";
		case 5: return "<:dice_5:1501654775354097746>";
		case 6: return "<:dice_6:1501654860603461652>";
		default: return "🎲";
	}
}