import React, { useEffect } from "react";
import { Link, useLocation } from "react-router";

interface UploadOption {
	label: string;
	value: string;
	uri: string;
	shortcut?: string;
}

const uploadOptions: UploadOption[] = [
	{
		label: "Text",
		value: "text",
		uri: "/text",
		shortcut: "1",
	},
	{
		label: "Code",
		value: "code",
		uri: "/code",
		shortcut: "2",
	},
];

const Navigation = () => {
	const location = useLocation();

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			const activeElement = document.activeElement;

			const isInputField =
				activeElement instanceof HTMLInputElement ||
				activeElement instanceof HTMLTextAreaElement ||
				activeElement?.hasAttribute("contenteditable");

			if (isInputField) {
				return;
			}

			const option = uploadOptions.find((opt) => opt.shortcut === event.key);

			if (option) {
				if (location.pathname === option.uri) {
					return;
				}

				event.preventDefault();

				window.location.href = option.uri;
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [location.pathname]);

	return (
		<div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-onyx-800 overflow-hidden rounded-lg border border-onyx-700 z-10">
			<div className="flex">
				{uploadOptions.map((option) => {
					const isActive = location.pathname === option.uri;
					return (
						<Link
							key={option.value}
							to={option.uri}
							className={`px-4 py-2 text-sm font-medium flex items-center ${
								isActive
									? "bg-onyx-700 text-onyx-200"
									: "text-onyx-200 hover:bg-onyx-700"
							} transition-colors`}
						>
							<span>{option.label}</span>
							{option.shortcut && (
								<span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-royal-yellow text-onyx-900">
									{option.shortcut}
								</span>
							)}
						</Link>
					);
				})}
			</div>
		</div>
	);
};

export default Navigation;
