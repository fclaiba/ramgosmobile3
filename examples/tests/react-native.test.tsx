import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
// Note: This is a generic example of a React Native test

// Simple mock for React Native components
const View = ({children}) => <>{children}</>;
const Text = ({children}) => <>{children}</>;
const Button = ({title, onPress, testID}) => <button testID={testID} onClick={onPress}>{title}</button>;

// A mock component representing a Role Selector
const RoleSelector = ({ onSelectRole }) => {
  return (
    <View>
      <Text>Select your role:</Text>
      <Button testID="btn-consumer" title="Consumer" onPress={() => onSelectRole('consumer')} />
      <Button testID="btn-business" title="Business" onPress={() => onSelectRole('business')} />
    </View>
  );
};

describe('React Native Component Tests', () => {
  test('should call onSelectRole with "consumer" when consumer button is pressed', () => {
    const mockSelectRole = jest.fn();
    const { getByTestId } = render(<RoleSelector onSelectRole={mockSelectRole} />);

    const consumerButton = getByTestId('btn-consumer');
    fireEvent.press(consumerButton);

    expect(mockSelectRole).toHaveBeenCalledWith('consumer');
    expect(mockSelectRole).toHaveBeenCalledTimes(1);
  });
});
