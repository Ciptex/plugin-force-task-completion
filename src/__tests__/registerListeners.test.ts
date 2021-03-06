import configureStore from 'redux-mock-store';
import { ACTION_CLEAR_TIMERS } from './../constants/ActionTypes';
import {
  reservationWrapUpCallback,
  reservationCompletionCallback,
} from './../registerListeners';

declare global {
  interface Window {
    Twilio: any;
  }
}

const task = {
  taskSid: 'WT123',
  taskChannelUniqueName: 'voice',
  queueSid: 'WQ123',
  dateUpdated: Date.now().valueOf() - 100000000,
  taskStatus: 'wrapping',
  conference: {
    participants: [
      {
        isMyself: false,
        status: 'recently_left',
      },
    ],
  },
} as any;

const configuredStore = configureStore();
const store = configuredStore({
  forceTaskCompletion: {
    timeoutId: 200,
  },
  flex: {
    worker: {
      tasks: new Map([['WT123', task]]),
    },
    config: {
      pluginForceTaskCompletion: {
        taskQueues: ['WQ123'],
        taskChannels: ['voice'],
      },
    },
  },
});

global.Twilio = {
  Flex: {
    Manager: {
      getInstance: () => ({ store }),
    },
    Notifications: {
      showNotification: jest.fn(),
      dismissNotificationById: jest.fn(),
    },
  },
};

const dispatch = jest.fn();

const mockedManager = {
  store: {
    getState: () => ({
      forceTaskCompletion: {
        timeoutId: 100,
      },
    }),
    dispatch,
  },
} as any;

describe('registerListeners', () => {
  it('it dispatches the correct event on task wrap up', () => {
    global.setTimeout = () => 100 as any;

    reservationWrapUpCallback(mockedManager);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'plugin-force-completion/START_TIMER',
      payload: {
        timeoutId: 100,
      },
    });
  });

  it('it dispatches the correct event on task completion', () => {
    reservationCompletionCallback(mockedManager);

    expect(dispatch).toHaveBeenCalledWith({ type: ACTION_CLEAR_TIMERS });
  });
});
