export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}
