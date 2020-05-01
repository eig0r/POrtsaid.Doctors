export default function isValidUserName(email) {
	/* eslint-disable no-useless-escape */
	const reg = /[ `!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;
	return !reg.test(email);
}
