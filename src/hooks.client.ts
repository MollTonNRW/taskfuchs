import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, event, status, message }) => {
	const err = error as Error;
	console.error('=== CLIENT ERROR ===');
	console.error('Status:', status);
	console.error('Message:', message);
	console.error('URL:', event.url.href);
	console.error('Error:', err?.message ?? error);
	console.error('Stack:', err?.stack ?? '');

	return {
		message: err?.message ?? message ?? 'Unknown error',
		stack: err?.stack ?? '',
		status
	};
};
