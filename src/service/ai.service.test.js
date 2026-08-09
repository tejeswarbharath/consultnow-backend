const { triageProblem, generateMarketing, generateMeetingSynopsis } = require('./ai.service');
const aiService = require('./ai.service');

jest.mock('./ai.service', () => ({
  triageProblem: jest.fn(),
  generateMarketing: jest.fn(),
  generateMeetingSynopsis: jest.fn()
}));

describe('AI Service', () => {
  beforeEach(() => {
    aiService.triageProblem.mockClear();
    aiService.generateMarketing.mockClear();
    aiService.generateMeetingSynopsis.mockClear();
  });

  describe('triageProblem', () => {
    it('should return a category from the AI service', async () => {
      const mockResponse = 'IT Career Guidance';
      aiService.triageProblem.mockResolvedValue(mockResponse);

      const problemDescription = 'I need help with a contract.';
      const result = await triageProblem(problemDescription);

      expect(result).toBe(mockResponse);
    });
  });

  describe('generateMarketing', () => {
    it('should return a marketing bio and snippet', async () => {
      const mockResponse = {
        bio: 'This is a bio.',
        marketingSnippet: 'This is a snippet.',
      };
      aiService.generateMarketing.mockResolvedValue(mockResponse);

      const skills = 'Some skills';
      const expertId = 'some-id';
      const result = await generateMarketing(skills, expertId);

      expect(result).toEqual(mockResponse);
    });
  });

  describe('generateMeetingSynopsis', () => {
    it('should return HTML structured meeting synopsis and evaluation metrics', async () => {
      const mockHtmlSynopsis = '<h4>1. Executive Summary</h4><p>Mock synopsis content</p>';
      aiService.generateMeetingSynopsis.mockResolvedValue(mockHtmlSynopsis);

      const bookingDetails = {
        guestName: 'John Doe',
        expertName: 'Dr. Smith',
        bookingType: 'Paid 1-Hour Consultation',
        details: 'IT Career Advice'
      };

      const result = await generateMeetingSynopsis(bookingDetails);
      expect(result).toBe(mockHtmlSynopsis);
    });
  });
});
